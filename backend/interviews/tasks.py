"""
Celery tasks for bulk interview processing
"""

from celery import shared_task, group
from celery.exceptions import Retry
from django.utils import timezone
from django.db import transaction
from django.core.cache import cache
import logging
import time
import random

logger = logging.getLogger(__name__)

RETRY_BASE_SECONDS = 60
RETRY_MAX_SECONDS = 600
RETRY_JITTER_SECONDS = 30


def _build_transient_exceptions():
    transient = [TimeoutError, ConnectionError, OSError]
    try:
        from requests import exceptions as requests_exceptions
        transient.append(requests_exceptions.RequestException)
    except Exception:
        pass
    try:
        from google.api_core import exceptions as google_exceptions
        transient.extend([
            google_exceptions.ServiceUnavailable,
            google_exceptions.DeadlineExceeded,
            google_exceptions.TooManyRequests,
            google_exceptions.InternalServerError,
        ])
    except Exception:
        pass
    return tuple(transient)


TRANSIENT_EXCEPTIONS = _build_transient_exceptions()

GUARD_HIT_CACHE_KEY = "traffic_monitor:idempotency_guard_hits:last_1h"
RETRY_COUNT_CACHE_KEY = "traffic_monitor:retry_attempts:last_15m"
GUARD_HIT_TTL_SECONDS = 3600
RETRY_COUNT_TTL_SECONDS = 900


def _is_transient_error(exc: Exception) -> bool:
    return isinstance(exc, TRANSIENT_EXCEPTIONS)

def _increment_cache_counter(key: str, ttl_seconds: int) -> None:
    try:
        cache.add(key, 0, timeout=ttl_seconds)
        cache.incr(key)
    except Exception:
        logger.debug("Unable to increment cache counter %s", key)


def _record_guard_hit(interview_id: int, reason: str) -> None:
    _increment_cache_counter(GUARD_HIT_CACHE_KEY, GUARD_HIT_TTL_SECONDS)
    logger.info("Idempotency guard hit for interview %s (%s)", interview_id, reason)


def _mark_terminal_failure(interview, queue_entry, error_message: str):
    if queue_entry:
        queue_entry.status = 'failed'
        queue_entry.error_message = error_message
        queue_entry.completed_at = timezone.now()
        queue_entry.save(update_fields=['status', 'error_message', 'completed_at'])
    if interview:
        interview.status = 'failed'
        interview.error_message = error_message
        interview.completed_at = timezone.now()
        interview.save(update_fields=['status', 'error_message', 'completed_at'])


def _retry_with_backoff(self, exc: Exception, target_id: int, queue_entry=None):
    if not _is_transient_error(exc):
        logger.error("Non-transient error for task target %s: %s", target_id, exc)
        raise
    retries = self.request.retries
    max_retries = getattr(self, "max_retries", 3)
    if retries >= max_retries:
        logger.error("Max retries reached for task target %s", target_id)
        raise
    _increment_cache_counter(RETRY_COUNT_CACHE_KEY, RETRY_COUNT_TTL_SECONDS)
    delay = min(RETRY_BASE_SECONDS * (2 ** retries) + random.randint(0, RETRY_JITTER_SECONDS), RETRY_MAX_SECONDS)
    logger.warning(
        "Retrying task target %s in %ss (attempt %s/%s)",
        target_id,
        delay,
        retries + 1,
        max_retries,
    )
    raise self.retry(exc=exc, countdown=delay)


@shared_task(
    bind=True,
    max_retries=3,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=300,
    time_limit=360,
)
def process_complete_interview(self, interview_id):
    """
    Process all video responses in BULK after interview submission
    
    Workflow:
    1. Get all video responses for interview
    2. Transcribe all videos in parallel (using batch_transcribe_and_analyze)
    3. Analyze all transcripts in ONE API call
    4. Detect script reading for each video
    5. Save results and calculate score
    
    Benefits:
    - Faster: Parallel transcription + Single API call for analysis
    - Cost-effective: Fewer API calls
    - Consistent: Uses same optimized logic as synchronous fallback
    """
    from interviews.models import Interview, VideoResponse, AIAnalysis
    from processing.models import ProcessingQueue
    from interviews.ai_service import get_ai_service
    from interviews.ai import detect_script_reading
    
    monotonic_start = time.monotonic()
    interview = None
    queue_entry = None

    logger.info("Interview %s task start (task_id=%s)", interview_id, self.request.id)

    try:
        with transaction.atomic():
            interview = Interview.objects.select_for_update().get(id=interview_id)
            if interview.status in ['completed', 'failed']:
                _record_guard_hit(interview_id, f"status_{interview.status}")
                return {'status': 'skipped', 'reason': interview.status}

            try:
                queue_entry = ProcessingQueue.objects.select_for_update().filter(
                    interview=interview,
                    processing_type='bulk_analysis'
                ).latest('created_at')
                if queue_entry.status in ['processing', 'completed']:
                    _record_guard_hit(interview_id, f"queue_{queue_entry.status}")
                    return {'status': 'skipped', 'reason': f"queue_{queue_entry.status}"}
                queue_entry.status = 'processing'
                queue_entry.started_at = timezone.now()
                queue_entry.celery_task_id = self.request.id
                queue_entry.save(update_fields=['status', 'started_at', 'celery_task_id'])
            except ProcessingQueue.DoesNotExist:
                queue_entry = None
                if interview.status == 'processing':
                    _record_guard_hit(interview_id, "processing_no_queue")
                    return {'status': 'skipped', 'reason': 'processing'}

            if interview.status != 'processing':
                interview.status = 'processing'
                interview.save(update_fields=['status'])

        logger.info(f"AI analysis started for interview {interview_id}")
        
        # Get all video responses
        video_responses = list(interview.video_responses.all())
        logger.info(f"Found {len(video_responses)} video responses to process")
        
        # Check if transcripts are already available (from upload step)
        from interviews.deepgram_service import get_deepgram_service
        
        videos_needing_transcription = [vr for vr in video_responses if not vr.transcript]
        
        # Transcribe any videos that don't have transcripts yet (fallback)
        if videos_needing_transcription:
            logger.warning(f"Found {len(videos_needing_transcription)} videos without transcripts, transcribing now...")
            deepgram_service = get_deepgram_service()
            for vr in videos_needing_transcription:
                try:
                    transcript_data = deepgram_service.transcribe_video(
                        vr.video_file_path.path,
                        video_response_id=vr.id
                    )
                    vr.transcript = transcript_data['transcript']
                    vr.save()
                    logger.info(f"Transcribed video {vr.id}")
                except Exception as trans_error:
                    logger.error(f"Failed to transcribe video {vr.id}: {trans_error}")
                    vr.transcript = ""
                    vr.save()
        
        role = interview.position_type
        role_name = role.name if role else None
        role_code = role.code if role else None
        role_context = role.description_context or role.description if role else None
        from interviews.scoring import get_role_prompt_context

        prompt_context = get_role_prompt_context(role_code)
        core_competencies = prompt_context.get("core_competencies") or None
        role_profile = prompt_context.get("role_profile") or None
        role_profile = prompt_context.get("role_profile") or None

        # Prepare data for BATCH LLM ANALYSIS (transcripts already stored)
        transcripts_data = [
            {
                'video_id': vr.id,
                'transcript': vr.transcript,
                'question_text': vr.question.question_text,
                'question_type': vr.question.question_type.name if vr.question.question_type else 'general',
                'question_competency': vr.question.competency,
            }
            for vr in video_responses
        ]
        
        # Analyze all transcripts in ONE API call
        logger.info(f"Running batch LLM analysis for {len(transcripts_data)} transcripts...")
        ai_service = get_ai_service()
        analyses = ai_service.batch_analyze_transcripts(
            transcripts_data,
            interview_id=interview.id,
            role_name=role_name,
            role_code=role_code,
            role_context=role_context,
            role_profile=role_profile,
            core_competencies=core_competencies,
        )
        
        # Save LLM analysis results to database
        for video_response, analysis_result in zip(video_responses, analyses):
            try:
                # Check if transcript is empty (technical issue)
                is_technical_issue = not video_response.transcript or len(video_response.transcript.strip()) == 0
                
                # Detect script reading
                try:
                    script_detection = detect_script_reading(video_response.video_file_path.path)
                except Exception as e:
                    logger.error(f"Script detection failed for video {video_response.id}: {e}")
                    script_detection = {'status': 'clear', 'risk_score': 0, 'data': {'error': str(e)}}
                
                with transaction.atomic():
                    if is_technical_issue:
                        # For technical issues, don't create AI analysis, just flag the video
                        video_response.ai_score = None
                        video_response.sentiment = None
                        video_response.script_reading_status = script_detection['status']
                        video_response.script_reading_data = script_detection['data']
                        video_response.processed = True
                        video_response.status = 'analyzed'
                        video_response.save()
                        logger.warning(f"Video {video_response.id} has no transcript (technical issue)")
                    else:
                        # Save AI analysis
                        AIAnalysis.objects.update_or_create(
                            video_response=video_response,
                            defaults={
                                'transcript_text': video_response.transcript,  # Already stored from upload
                                'sentiment_score': analysis_result.get('sentiment_score', 50.0),
                                'confidence_score': analysis_result.get('confidence_score', 50.0),
                                'speech_clarity_score': analysis_result.get('speech_clarity_score', 50.0),
                                'content_relevance_score': analysis_result.get('content_relevance_score', 50.0),
                                'overall_score': analysis_result.get('overall_score', 50.0),
                                'recommendation': analysis_result.get('recommendation', 'review'),
                                'body_language_analysis': {},
                                'langchain_analysis_data': {
                                    'analysis_summary': analysis_result.get('analysis_summary', ''),
                                    'raw_scores': analysis_result
                                }
                            }
                        )
                        
                        # Update video_response with scores
                        video_response.ai_score = analysis_result.get('overall_score', 50.0)
                        video_response.sentiment = analysis_result.get('sentiment_score', 50.0)
                        video_response.script_reading_status = script_detection['status']
                        video_response.script_reading_data = script_detection['data']
                        video_response.processed = True
                        video_response.status = 'analyzed'
                        video_response.save()
                        logger.info(f"Saved LLM analysis for video {video_response.id}")
            except Exception as save_error:
                logger.error(f"Failed to save analysis for video {video_response.id}: {save_error}")
                video_response.status = 'failed'
                video_response.save()
        
        logger.info("All video analyses complete. Checking authenticity...")
        
        # Check for script reading and update interview-level authenticity flag
        interview.check_authenticity()
        interview.refresh_from_db()
        
        logger.info("Calculating interview score...")
        
        # Calculate overall score
        calculate_interview_score(interview_id)
        
        # Create final result
        create_interview_result(interview_id)
        
        # Update interview status
        interview.status = 'completed'
        interview.completed_at = timezone.now()
        interview.save(update_fields=['status', 'completed_at'])
        
        # Update queue
        if queue_entry:
            queue_entry.status = 'completed'
            queue_entry.completed_at = timezone.now()
            queue_entry.save(update_fields=['status', 'completed_at'])
        
        # Send notification (async)
        try:
            from notifications.tasks import send_result_notification
            send_result_notification.delay(interview_id)
        except Exception:
            logger.exception("Failed to queue notification for interview %s", interview_id)
        
        elapsed_ms = int((time.monotonic() - monotonic_start) * 1000)
        logger.info(f"AI analysis complete for interview {interview_id} in {elapsed_ms}ms")
        
        return {
            'status': 'success',
            'interview_id': interview_id,
            'videos_processed': len(video_responses)
        }
        
    except Exception as e:
        logger.error(f"Error processing interview {interview_id}: {str(e)}", exc_info=True)
        try:
            _retry_with_backoff(self, e, interview_id, queue_entry=queue_entry)
        except Retry:
            raise
        except Exception as retry_error:
            try:
                _mark_terminal_failure(interview, queue_entry, str(e))
            except Exception:
                logger.exception("Failed to mark terminal failure for interview %s", interview_id)
            raise retry_error

# Single public entry point for background analysis
analyze_interview = process_complete_interview


@shared_task(
    bind=True,
    max_retries=3,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=300,
    time_limit=360,
)
def analyze_single_video(self, video_response_id):
    """
    Analyze individual video response
    Called in parallel by bulk processing task
    
    Steps:
    1. Extract audio from video
    2. Transcribe audio to text
    3. Analyze video for body language (optional)
    4. Sentiment analysis
    5. Content relevance scoring
    6. Calculate individual score
    7. Store in VideoResponse model
    """
    from interviews.models import VideoResponse, AIAnalysis
    from interviews.ai_service import get_ai_service
    from interviews.ai import detect_script_reading
    import traceback
    
    try:
        logger.info(f"Analyzing video response {video_response_id}")
        
        video_response = VideoResponse.objects.get(id=video_response_id)
        video_response.status = 'processing'
        video_response.save()
        
        # Get AI service
        ai_service = get_ai_service()
        
        # Get video file path
        video_path = video_response.video_file_path.path
        logger.info(f"Video path: {video_path}")
        
        # Step 1 & 2: Transcribe video
        logger.info("Transcribing video...")
        transcript = ai_service.transcribe_video(video_path)
        logger.info(f"Transcription complete: {len(transcript)} characters")
        
        # Step 3, 4, 5, 6: Analyze transcript
        logger.info("Analyzing transcript...")
        role = video_response.interview.position_type if hasattr(video_response, "interview") else None
        role_name = role.name if role else None
        role_code = role.code if role else None
        role_context = role.description_context or role.description if role else None
        from interviews.scoring import get_role_prompt_context

        prompt_context = get_role_prompt_context(role_code)
        core_competencies = prompt_context.get("core_competencies") or None

        role_profile = prompt_context.get("role_profile") or None

        analysis_result = ai_service.analyze_transcript(
            transcript_text=transcript,
            question_text=video_response.question.question_text,
            question_type=video_response.question.question_type,
            role_name=role_name,
            role_code=role_code,
            role_context=role_context,
            question_competency=video_response.question.competency,
            role_profile=role_profile,
            core_competencies=core_competencies,
        )
        logger.info(f"Analysis complete. Score: {analysis_result.get('overall_score')}")
        
        # Step 7: Script reading detection
        logger.info("Detecting script reading...")
        script_detection = detect_script_reading(video_path)
        logger.info(f"Script detection complete. Status: {script_detection['status']} (risk: {script_detection['risk_score']})")
        
        # Step 8: Store analysis results
        with transaction.atomic():
            # Store in VideoResponse for quick access
            video_response.transcript = transcript
            video_response.ai_score = analysis_result.get('overall_score', 50.0)
            video_response.sentiment = analysis_result.get('sentiment_score', 50.0)
            video_response.script_reading_status = script_detection['status']
            video_response.script_reading_data = script_detection['data']
            video_response.status = 'analyzed'
            video_response.processed = True  # Backward compatibility
            video_response.save()
            
            # Create or update detailed AI Analysis record (idempotent)
            AIAnalysis.objects.update_or_create(
                video_response=video_response,
                defaults={
                    'transcript_text': transcript,
                    'sentiment_score': analysis_result.get('sentiment_score', 50.0),
                    'confidence_score': analysis_result.get('confidence_score', 50.0),
                    'speech_clarity_score': analysis_result.get('speech_clarity_score', 50.0),
                    'content_relevance_score': analysis_result.get('content_relevance_score', 50.0),
                    'overall_score': analysis_result.get('overall_score', 50.0),
                    'recommendation': analysis_result.get('recommendation', 'review'),
                    'body_language_analysis': {},  # Not implemented yet
                    'langchain_analysis_data': analysis_result,
                }
            )
        
        logger.info(f"Video response {video_response_id} analyzed successfully")
        
        return {
            'status': 'success',
            'video_response_id': video_response_id,
            'score': video_response.ai_score
        }
        
    except VideoResponse.DoesNotExist:
        logger.error(f"VideoResponse {video_response_id} not found")
        raise
        
    except Exception as e:
        logger.error(f"Error analyzing video {video_response_id}: {str(e)}", exc_info=True)
        logger.error(traceback.format_exc())
        
        try:
            _retry_with_backoff(self, e, video_response_id)
        except Retry:
            raise
        except Exception:
            try:
                video_response = VideoResponse.objects.get(id=video_response_id)
                video_response.status = 'failed'
                video_response.save()
            except Exception:
                pass
            raise


def calculate_interview_score(interview_id):
    """
    Aggregate all video analysis results
    
    Calculates:
    1. Get all VideoResponse scores (including HR overrides)
    2. Apply weights to different questions
    3. Calculate overall score
    4. Generate final recommendation
    
    Note: Videos with technical issues (None scores) are excluded from calculation
    """
    from interviews.models import Interview
    
    logger.info(f"Calculating overall score for interview {interview_id}")
    
    interview = Interview.objects.get(id=interview_id)
    video_responses = interview.video_responses.all()
    
    if not video_responses.exists():
        logger.warning(f"No video responses found for interview {interview_id}")
        return None
    
    # Aggregate by competency (using final_score which includes HR overrides)
    total_weight = 0
    technical_issues_count = 0
    scores_by_competency = {}
    
    for video_response in video_responses:
        # Use final_score property which returns HR override if exists, else AI score
        score = video_response.final_score
        
        # Skip videos with technical issues (None scores)
        if score is None:
            technical_issues_count += 1
            logger.warning(f"Video {video_response.id} has technical issue (no audio), excluding from score")
            continue
        
        total_weight += 1.0

        competency = getattr(video_response.question, "competency", None) or "communication"
        bucket_total, bucket_count = scores_by_competency.get(competency, (0.0, 0))
        scores_by_competency[competency] = (bucket_total + score, bucket_count + 1)
    
    # If all videos have technical issues, return special status
    if total_weight == 0:
        logger.warning(f"All videos for interview {interview_id} have technical issues")
        return {
            'overall_score': 0,
            'recommendation': 'technical_issue',
            'total_responses': video_responses.count(),
            'technical_issues_count': technical_issues_count,
            'all_technical_issues': True,
            'raw_scores_per_competency': {},
            'weighted_scores_per_competency': {},
            'final_weighted_score': 0,
            'weights_used': {},
            'role_profile': '',
            'ai_recommendation_explanation': '',
        }
    
    from interviews.scoring import compute_competency_scores

    competency_score_data = compute_competency_scores(
        scores_by_competency=scores_by_competency,
        role_code=getattr(interview.position_type, "code", None),
    )
    overall_score = competency_score_data["final_weighted_score"] if total_weight > 0 else 0
    
    # Determine recommendation
    if overall_score >= 70:
        recommendation = 'pass'
    elif overall_score >= 50:
        recommendation = 'review'
    else:
        recommendation = 'fail'
    
    logger.info(f"Interview {interview_id} overall score: {overall_score:.2f}, recommendation: {recommendation}")
    if technical_issues_count > 0:
        logger.info(f"  Note: {technical_issues_count} video(s) excluded due to technical issues")
    
    return {
        'overall_score': overall_score,
        'recommendation': recommendation,
        'total_responses': video_responses.count(),
        'technical_issues_count': technical_issues_count,
        'all_technical_issues': False,
        'raw_scores_per_competency': competency_score_data["raw_scores_per_competency"],
        'weighted_scores_per_competency': competency_score_data["weighted_scores_per_competency"],
        'final_weighted_score': competency_score_data["final_weighted_score"],
        'weights_used': competency_score_data["weights_used"],
        'role_profile': competency_score_data["role_profile"],
        'ai_recommendation_explanation': competency_score_data["ai_recommendation_explanation"],
    }


def create_interview_result(interview_id):
    """
    Create InterviewResult entry
    """
    from interviews.models import Interview
    from results.models import InterviewResult
    
    logger.info(f"Creating result entry for interview {interview_id}")
    
    interview = Interview.objects.get(id=interview_id)
    
    # Calculate scores
    score_data = calculate_interview_score(interview_id)
    
    if not score_data:
        logger.error(f"Cannot create result - no score data for interview {interview_id}")
        return None
    
    # Create or update result
    result, created = InterviewResult.objects.update_or_create(
        interview=interview,
        defaults={
            'applicant': interview.applicant,
            'final_score': score_data['overall_score'],
            'passed': score_data['recommendation'] == 'pass'
        }
    )
    
    # Update applicant status based on recommendation
    applicant = interview.applicant
    if score_data['recommendation'] == 'pass':
        applicant.status = 'passed'
    elif score_data['recommendation'] == 'fail':
        applicant.status = 'failed'
    else:
        applicant.status = 'under_review'
    applicant.save()
    
    logger.info(f"Result created for interview {interview_id}: {score_data['recommendation']}")
    
    return result
