from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from accounts.permissions import IsHR, ApplicantOrHR
from rest_framework.settings import api_settings
from accounts.authentication import ApplicantTokenAuthentication
from django.shortcuts import get_object_or_404
from django.db.models import Q

from .models import Interview, InterviewQuestion, VideoResponse, JobPosition
from .type_models import PositionType, QuestionType
from .serializers import (
    InterviewListSerializer,
    InterviewSerializer,
    InterviewCreateSerializer,
    VideoResponseSerializer,
    VideoResponseCreateSerializer,
    InterviewAnalysisSerializer,
    InterviewQuestionSerializer,
    JobPositionSerializer
)
from .type_serializers import JobCategorySerializer, QuestionTypeSerializer
from .type_serializers import JobCategorySerializer as PositionTypeSerializer


class JobCategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Job Categories
    """

    queryset = PositionType.objects.all().order_by('order', 'name')
    serializer_class = JobCategorySerializer
    permission_classes = [IsAuthenticated, IsHR]

    def get_permissions(self):
        """
        Allow authenticated users; write actions require staff/permission.
        """
        class ManageJobCategoriesPermission(IsAuthenticated):
            def has_permission(self_inner, request, view):
                if not super().has_permission(request, view):
                    return False
                # allow read for any authenticated HR/staff; allow write if staff or perm
                if request.method in ["GET", "HEAD", "OPTIONS"]:
                    return True
                user = request.user
                return bool(
                    getattr(user, "is_superuser", False)
                    or getattr(user, "is_staff", False)
                    or user.has_perm("interviews.manage_job_categories")
                )

        return [ManageJobCategoriesPermission()]

    def get_queryset(self):
        """Filter to active types only if requested"""
        queryset = super().get_queryset()
        code = self.request.query_params.get('code')
        if code:
            queryset = queryset.filter(code=code)
        if self.action in ['list', 'retrieve']:
            return queryset.filter(is_active=True)
        active_only = self.request.query_params.get('active_only', 'false').lower() == 'true'
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset


class JobPositionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Job Positions
    """

    queryset = JobPosition.objects.all()
    serializer_class = JobPositionSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action in ['list', 'retrieve'] and not self.request.user.is_authenticated:
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class QuestionTypeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Question Types
    
    Endpoints:
    - GET /api/question-types/ - List all question types
    - POST /api/question-types/ - Create new question type
    - GET /api/question-types/{id}/ - Get question type details
    - PUT/PATCH /api/question-types/{id}/ - Update question type
    - DELETE /api/question-types/{id}/ - Delete question type
    """
    
    queryset = QuestionType.objects.all().order_by('order', 'name')
    serializer_class = QuestionTypeSerializer
    permission_classes = [IsAuthenticated, IsHR]
    
    def get_queryset(self):
        """Filter to active types only if requested"""
        queryset = super().get_queryset()
        active_only = self.request.query_params.get('active_only', 'false').lower() == 'true'
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset


class PositionTypeViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Position Types (lookup by code or by job position code)
    """

    queryset = PositionType.objects.all()
    serializer_class = PositionTypeSerializer
    permission_classes = [AllowAny()]

    def get_queryset(self):
        qs = super().get_queryset()
        code = self.request.query_params.get("code")
        position_code = self.request.query_params.get("position_code")
        if code:
            qs = qs.filter(code=code)
        if position_code:
            qs = qs.filter(positions__code=position_code)
        return qs


class InterviewQuestionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Interview Questions
    
    Endpoints:
    - GET /api/questions/ - List all active questions
    - POST /api/questions/ - Create new question
    - GET /api/questions/{id}/ - Get question details
    - PUT/PATCH /api/questions/{id}/ - Update question
    - DELETE /api/questions/{id}/ - Delete question
    - GET /api/questions/?position=<id> - Filter by position type ID
    - GET /api/questions/?type=<id> - Filter by question type ID
    """
    
    queryset = InterviewQuestion.objects.select_related('question_type', 'position_type', 'category').filter(is_active=True).order_by('order')
    serializer_class = InterviewQuestionSerializer
    
    def get_permissions(self):
        """Allow anyone to list/retrieve questions, but require auth for create/update/delete"""
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def get_queryset(self):
        """Filter questions based on query parameters"""
        queryset = super().get_queryset()
        
        # Filter by position type (accepts ID or code)
        position = self.request.query_params.get('position', None)
        if position:
            # Try to filter by ID first, if that fails, filter by code
            if position.isdigit():
                queryset = queryset.filter(position_type_id=int(position))
            else:
                queryset = queryset.filter(position_type__code=position)
        
        category = self.request.query_params.get('category', None)
        if category:
            if category.isdigit():
                queryset = queryset.filter(category_id=int(category))
            else:
                queryset = queryset.filter(category__code=category)
        
        # Filter by question type (accepts ID or code)
        question_type = self.request.query_params.get('type', None)
        if question_type:
            # Try to filter by ID first, if that fails, filter by code
            if question_type.isdigit():
                queryset = queryset.filter(question_type_id=int(question_type))
            else:
                queryset = queryset.filter(question_type__code=question_type)
        
        return queryset


class InterviewViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Interview model
    
    Endpoints:
    - POST /api/interviews/ - Create new interview
    - GET /api/interviews/ - List all interviews
    - GET /api/interviews/{id}/ - Get interview details
    - POST /api/interviews/{id}/video-response/ - Upload video response
    - GET /api/interviews/{id}/analysis/ - Get interview analysis
    """
    
    queryset = Interview.objects.all()
    
    def get_serializer_class(self):
        if self.action == "create":
            return InterviewCreateSerializer
        elif self.action == "analysis":
            return InterviewAnalysisSerializer
        elif self.action == "list":
            return InterviewListSerializer   # <── THIS FIXES YOUR TIMEOUT
        return InterviewSerializer

    
    authentication_classes = [ApplicantTokenAuthentication, *api_settings.DEFAULT_AUTHENTICATION_CLASSES]

    def get_permissions(self):
        """Allow anyone to create/interact; restrict listing to HR; allow applicant or HR for interview detail/submit paths"""
        if self.action in ['list']:
            return [IsAuthenticated(), IsHR()]
        if self.action in ['retrieve', 'submit', 'analysis', 'video_response', 'complete']:
            return [ApplicantOrHR()]
        if self.action in ['create']:
            return [AllowAny()]
        return super().get_permissions()
    
    def get_queryset(self):
        qs = Interview.objects.all()

        if self.action == "list":
            return qs.select_related("applicant", "position_type").order_by("-created_at")

        return qs.select_related("applicant", "position_type") \
                .prefetch_related("video_responses") \
                .order_by("-created_at")

    
    def create(self, request, *args, **kwargs):
        """Create new interview"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        interview = serializer.save()

        # Attach category-based questions using job category derived from position_type
        if interview.position_type_id:
            subroles = getattr(interview, "_job_position_subroles", None)
            # Attempt to derive job position from request if not already set
            if subroles is None:
                job_position_id = request.data.get("job_position_id") or request.data.get("job_position")
                if job_position_id:
                    try:
                        job_position = JobPosition.objects.get(id=job_position_id)
                        subroles = job_position.subroles or []
                        setattr(interview, "_job_position_subroles", subroles)
                    except JobPosition.DoesNotExist:
                        subroles = None

            base_qs = InterviewQuestion.objects.filter(
                is_active=True,
                category_id=interview.position_type_id
            ).order_by('order')
            selected_questions = base_qs
            if subroles:
                q = Q()
                for tag in subroles:
                    q |= Q(tags__contains=[tag])
                if q:
                    refined = base_qs.filter(q)
                    if refined.exists():
                        selected_questions = refined

            if hasattr(interview, "questions"):
                interview.questions.set(selected_questions)
        
        # Return full interview data with questions
        response_serializer = InterviewSerializer(interview)
        return Response(
            {
                'message': 'Interview created successfully',
                'interview': response_serializer.data
            },
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['post'], url_path='video-response', permission_classes=[AllowAny])
    def video_response(self, request, pk=None):
        """
        Upload video response WITHOUT immediate analysis
        Analysis happens in bulk after interview submission
        
        POST /api/interviews/{id}/video-response/
        Body: {
            "question_id": 1,
            "video_file_path": <file>,
            "duration": "00:02:30"
        }
        """
        interview = self.get_object()
        
        print(f"\n=== VIDEO UPLOAD REQUEST ===")
        print(f"Interview ID: {interview.id}")
        print(f"Interview Status: {interview.status}")
        print(f"Request Data: {request.data}")
        print(f"Request Files: {request.FILES}")
        
        # Check if interview is in valid state
        if interview.status in ['submitted', 'processing', 'completed']:
            return Response(
                {'error': 'Interview already submitted or completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Update interview status to in_progress
        if interview.status == 'pending':
            interview.status = 'in_progress'
            interview.save()
        
        # Create video response
        serializer = VideoResponseCreateSerializer(data=request.data)
        if not serializer.is_valid():
            print(f"Serializer validation failed: {serializer.errors}")
            return Response(
                {'error': 'Invalid data', 'details': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer.is_valid(raise_exception=True)
        
        question_id = serializer.validated_data.get('question_id')
        if not question_id:
            return Response(
                {'error': 'question_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        question = get_object_or_404(InterviewQuestion, id=question_id, is_active=True)
        
        # Check if response already exists for this question
        existing_response = VideoResponse.objects.filter(
            interview=interview,
            question=question
        ).first()
        
        if existing_response:
            return Response(
                {'error': 'A response for this question already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create video response with 'uploaded' status
        video_response = VideoResponse.objects.create(
            interview=interview,
            question=question,
            video_file_path=serializer.validated_data['video_file_path'],
            duration=serializer.validated_data['duration'],
            status='uploaded'
        )
        
        # IMMEDIATE TRANSCRIPTION: Use Deepgram STT to transcribe and store transcript
        # This is fast (~2-5 seconds) and doesn't wait for LLM analysis
        try:
            from .deepgram_service import get_deepgram_service
            
            print(f"🎤 Starting Deepgram transcription for video {video_response.id}...")
            deepgram_service = get_deepgram_service()
            
            # Transcribe video to text
            transcript_data = deepgram_service.transcribe_video(
                video_response.video_file_path.path,
                video_response_id=video_response.id
            )
            
            # Store transcript in database
            video_response.transcript = transcript_data['transcript']
            video_response.status = 'uploaded'  # Still uploaded, not analyzed yet
            video_response.save()
            
            print(f"✅ Transcript stored: {len(transcript_data['transcript'])} chars")
            
        except Exception as transcription_error:
            # Log error but don't fail the upload
            print(f"⚠️ Transcription failed (will retry on submit): {transcription_error}")
            video_response.transcript = ""  # Empty transcript, will be handled on submit
            video_response.save()
        
        response_data = VideoResponseSerializer(video_response).data
        
        return Response(
            {
                'message': 'Video uploaded and transcribed successfully. AI analysis will begin after interview submission.',
                'video_response': response_data,
                'transcript_ready': bool(video_response.transcript)
            },
            status=status.HTTP_201_CREATED
        )
    
    @action(detail=True, methods=['get'], url_path='analysis', permission_classes=[AllowAny])
    def analysis(self, request, pk=None):
        """
        Get AI analysis results for interview
        
        GET /api/interviews/{id}/analysis/
        """
        interview = self.get_object()
        
        # Check if interview has video responses
        if not interview.video_responses.exists():
            return Response(
                {'error': 'No video responses found for this interview'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Check AI processing status
        total_videos = interview.video_responses.count()
        processed_videos = interview.video_responses.filter(processed=True).count()
        videos_with_ai = sum(1 for v in interview.video_responses.all() if hasattr(v, 'ai_analysis'))
        
        ai_processing_complete = (total_videos > 0 and videos_with_ai == total_videos)
        
        serializer = InterviewAnalysisSerializer(interview)
        
        return Response({
            'analysis': serializer.data,
            'ai_processing_complete': ai_processing_complete,
            'processing_stats': {
                'total_videos': total_videos,
                'processed_videos': processed_videos,
                'videos_with_ai_analysis': videos_with_ai
            }
        })
    
    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """
        Submit entire interview for BULK processing
        All videos should already be uploaded
        Analysis happens in background after submission
        
        POST /api/interviews/{id}/submit/
        """
        interview = self.get_object()
        
        print(f"\n=== INTERVIEW SUBMISSION REQUEST ===")
        print(f"Interview ID: {interview.id}")
        print(f"Interview Status: {interview.status}")
        print(f"Position Type: {interview.position_type}")
        
        # Get total responses
        total_responses = interview.video_responses.count()
        print(f"Total video responses: {total_responses}")
        
        # Validate we have at least some responses
        if total_responses == 0:
            print(f"❌ Validation failed: No questions answered")
            return Response({
                'error': 'No questions have been answered',
                'answered': 0
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get the question IDs that were answered
        answered_question_ids = list(interview.video_responses.values_list('question_id', flat=True))
        print(f"Answered question IDs: {answered_question_ids}")
        
        # Check if all answered questions are valid and active
        valid_questions = InterviewQuestion.objects.filter(
            id__in=answered_question_ids,
            is_active=True
        ).count()
        print(f"Valid questions: {valid_questions} of {total_responses}")
        
        if valid_questions != total_responses:
            print(f"❌ Validation failed: Some invalid questions")
            return Response({
                'error': 'Some responses are for invalid questions',
                'answered': total_responses,
                'valid': valid_questions
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate minimum questions answered (at least 5 for position-based interviews)
        MINIMUM_QUESTIONS_REQUIRED = 5
        
        if interview.position_type:
            print(f"Checking minimum questions: {total_responses} >= {MINIMUM_QUESTIONS_REQUIRED}?")
            if total_responses < MINIMUM_QUESTIONS_REQUIRED:
                print(f"❌ Validation failed: Not enough questions answered")
                # Use the related PositionType name instead of a non-existent
                # get_position_type_display helper on Interview.
                position_name = getattr(interview.position_type, "name", None) or "Unknown position"
                return Response({
                    'error': f'Please answer at least {MINIMUM_QUESTIONS_REQUIRED} questions',
                    'answered': total_responses,
                    'required': MINIMUM_QUESTIONS_REQUIRED,
                    'position': position_name
                }, status=status.HTTP_400_BAD_REQUEST)
        
        print(f"✅ All validations passed!")
        
        # Mark interview as submitted and start processing
        from django.utils import timezone
        interview.status = 'submitted'
        interview.submission_date = timezone.now()
        interview.save()
        try:
            applicant = interview.applicant
            if applicant:
                applicant.interview_completed = True
                applicant.save(update_fields=["interview_completed"])
        except Exception:
            pass
        
        # Create processing queue entry
        from processing.models import ProcessingQueue
        queue_entry = ProcessingQueue.objects.create(
            interview=interview,
            processing_type='bulk_analysis',
            status='pending'
        )
        
        # Try async processing first (Redis/Celery), fall back to background thread
        processing_started = False
        try:
            from .tasks import process_complete_interview
            from django.db import transaction
            
            # Queue task after transaction commits to ensure DB consistency
            def queue_celery_task():
                process_complete_interview.delay(interview.id)
                print(f"✓ Celery task queued for interview {interview.id}")
            
            transaction.on_commit(queue_celery_task)
            processing_started = True
            print(f"✓ Celery task scheduled to queue after commit")
        except Exception as e:
            print(f"⚠ Redis/Celery not available, starting background thread: {e}")
            
            # Process in background thread (non-blocking - returns immediately)
            import threading
            def process_in_background():
                try:
                    from .ai_service import get_ai_service
                    from .deepgram_service import get_deepgram_service
                    from .models import AIAnalysis
                    print(f"Starting LLM batch analysis for interview {interview.id}...")
                    
                    interview.status = 'processing'
                    interview.save()
                    
                    ai_service = get_ai_service()
                    deepgram_service = get_deepgram_service()
                    video_responses = list(interview.video_responses.all())
                    
                    # Check if transcripts are already available (from upload step)
                    videos_needing_transcription = [vr for vr in video_responses if not vr.transcript]
                    
                    # Transcribe any videos that don't have transcripts yet (fallback)
                    if videos_needing_transcription:
                        print(f"⚠️ Found {len(videos_needing_transcription)} videos without transcripts, transcribing now...")
                        for vr in videos_needing_transcription:
                            try:
                                transcript_data = deepgram_service.transcribe_video(
                                    vr.video_file_path.path,
                                    video_response_id=vr.id
                                )
                                vr.transcript = transcript_data['transcript']
                                vr.save()
                                print(f"✓ Transcribed video {vr.id}")
                            except Exception as trans_error:
                                print(f"❌ Failed to transcribe video {vr.id}: {trans_error}")
                                vr.transcript = ""
                                vr.save()
                    
                    # Prepare data for BATCH LLM ANALYSIS (transcripts already stored)
                    transcripts_data = [
                        {
                            'video_id': vr.id,
                            'transcript': vr.transcript,
                            'question_text': vr.question.question_text,
                            'question_type': vr.question.question_type.name if vr.question.question_type else 'general'
                        }
                        for vr in video_responses
                    ]
                    
                    # Analyze all transcripts in ONE API call (no more transcription!)
                    print(f"📊 Running batch LLM analysis for {len(transcripts_data)} transcripts...")
                    analyses = ai_service.batch_analyze_transcripts(transcripts_data, interview_id=interview.id)
                    
                    # Save LLM analysis results to database
                    for video_response, analysis_result in zip(video_responses, analyses):
                        try:
                            # Check if transcript is empty (technical issue)
                            if not video_response.transcript or len(video_response.transcript.strip()) == 0:
                                # For technical issues, don't create AI analysis
                                video_response.ai_score = None
                                video_response.sentiment = None
                                video_response.processed = True
                                video_response.status = 'analyzed'
                                video_response.save()
                                print(f"⚠️ Video {video_response.id} has no transcript (technical issue)")
                            else:
                                # Normal processing with LLM analysis
                                # Save AI analysis
                                AIAnalysis.objects.create(
                                    video_response=video_response,
                                    transcript_text=video_response.transcript,  # Already stored from upload
                                    sentiment_score=analysis_result.get('sentiment_score', 50.0),
                                    confidence_score=analysis_result.get('confidence_score', 50.0),
                                    speech_clarity_score=analysis_result.get('speech_clarity_score', 50.0),
                                    content_relevance_score=analysis_result.get('content_relevance_score', 50.0),
                                    overall_score=analysis_result.get('overall_score', 50.0),
                                    recommendation=analysis_result.get('recommendation', 'review'),
                                    body_language_analysis={},
                                    langchain_analysis_data={
                                        'analysis_summary': analysis_result.get('analysis_summary', ''),
                                        'raw_scores': analysis_result
                                    }
                                )
                                
                                # Update video_response with scores
                                video_response.ai_score = analysis_result.get('overall_score', 50.0)
                                video_response.sentiment = analysis_result.get('sentiment_score', 50.0)
                                video_response.processed = True
                                video_response.status = 'analyzed'
                                video_response.save()
                                print(f"✓ Saved LLM analysis for video {video_response.id}")
                        except Exception as save_error:
                            print(f"✗ Failed to save analysis for video {video_response.id}: {save_error}")
                    
                    interview.status = 'completed'
                    interview.completed_at = timezone.now()
                    interview.save()
                    
                    # Auto-create InterviewResult after interview completion
                    from results.models import InterviewResult
                    from django.db.models import Avg
                    
                    # Calculate average score from all video responses
                    avg_score = interview.video_responses.aggregate(avg=Avg('ai_score'))['avg']
                    
                    if avg_score is not None:
                        # Determine if passed based on dynamic scoring thresholds from SystemSettings
                        from results.models import SystemSettings
                        passing_threshold = SystemSettings.get_passing_threshold()
                        passed = avg_score >= passing_threshold
                        
                        # Create result record
                        result, created = InterviewResult.objects.get_or_create(
                            interview=interview,
                            defaults={
                                'applicant': interview.applicant,
                                'final_score': round(avg_score, 2),
                                'passed': passed
                            }
                        )
                        if created:
                            print(f"✓ Created InterviewResult {result.id} with score {result.final_score}")
                        else:
                            # Update existing result
                            result.final_score = round(avg_score, 2)
                            result.passed = passed
                            result.save()
                            print(f"✓ Updated InterviewResult {result.id} with score {result.final_score}")
                        
                        # Update applicant status based on score
                        applicant = interview.applicant
                        if avg_score < 50:
                            # Failed: score below 50
                            applicant.status = 'failed'
                            applicant.save()
                            print(f"✓ Updated applicant {applicant.id} status to 'failed' (score: {avg_score})")
                        elif avg_score >= passing_threshold:
                            # Passed: score at or above passing threshold
                            applicant.status = 'passed'
                            applicant.save()
                            print(f"✓ Updated applicant {applicant.id} status to 'passed' (score: {avg_score})")
                        else:
                            # In review: score 50-74.9
                            applicant.status = 'in_review'
                            applicant.save()
                            print(f"✓ Updated applicant {applicant.id} status to 'in_review' (score: {avg_score})")
                    
                    queue_entry.status = 'completed'
                    queue_entry.save()
                    
                    print(f"✓ Interview {interview.id} processed successfully!")
                except Exception as process_error:
                    import traceback
                    error_msg = f"{str(process_error)}\n{traceback.format_exc()}"
                    print(f"✗ Error processing interview {interview.id}: {error_msg}")
                    interview.status = 'failed'
                    interview.error_message = error_msg
                    interview.save()
                    queue_entry.status = 'failed'
                    queue_entry.error_message = error_msg
                    queue_entry.save()
            
            # Start processing in background thread AFTER transaction commits
            # This ensures the response returns immediately
            from django.db import transaction
            
            def start_background_thread():
                thread = threading.Thread(target=process_in_background)
                thread.daemon = True
                thread.start()
                print(f"✓ Background processing thread started for interview {interview.id}")
            
            transaction.on_commit(start_background_thread)
            processing_started = True
            print(f"✓ Background thread scheduled to start after commit")
        
        # Return immediately - processing happens in background
        return Response({
            'message': 'Interview submitted successfully. AI analysis in progress.',
            'queue_id': queue_entry.id,
            'status': 'processing',
            'estimated_completion_minutes': 2
        })
    
    @action(detail=True, methods=['get'], url_path='processing-status')
    def processing_status(self, request, pk=None):
        """
        Check bulk processing status
        
        GET /api/interviews/{id}/processing-status/
        """
        interview = self.get_object()
        
        # Get processing queue entry
        from processing.models import ProcessingQueue
        try:
            queue_entry = ProcessingQueue.objects.filter(
                interview=interview,
                processing_type='bulk_analysis'
            ).latest('created_at')
        except ProcessingQueue.DoesNotExist:
            return Response({
                'error': 'No processing queue found for this interview'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Calculate progress
        total_videos = interview.video_responses.count()
        processed_videos = interview.video_responses.filter(status='analyzed').count()
        remaining = total_videos - processed_videos
        
        # Estimate time remaining (assume 10 seconds per video)
        estimated_seconds = remaining * 10
        
        if estimated_seconds < 60:
            estimated_time = f"{estimated_seconds} seconds"
        else:
            estimated_minutes = estimated_seconds // 60
            estimated_time = f"{estimated_minutes} minute{'s' if estimated_minutes > 1 else ''}"
        
        response_data = {
            'status': queue_entry.status,
            'progress': {
                'total_videos': total_videos,
                'processed': processed_videos,
                'remaining': remaining
            },
            'estimated_time_remaining': estimated_time
        }
        
        if queue_entry.status == 'completed':
            response_data['message'] = 'Processing complete! Redirecting to results...'
        elif queue_entry.status == 'failed':
            response_data['message'] = 'Processing failed. Please contact support.'
            response_data['error'] = queue_entry.error_message
        
        return Response(response_data)
    
    @action(detail=True, methods=['get'], url_path='video-responses')
    def list_video_responses(self, request, pk=None):
        """List all video responses for an interview"""
        interview = self.get_object()
        video_responses = interview.video_responses.all()
        serializer = VideoResponseSerializer(video_responses, many=True)
        
        return Response(serializer.data)
