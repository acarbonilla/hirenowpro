"""
Script to reprocess Interview 47 with rate limiting to avoid API quota issues
Gemini free tier limit: 10 requests per minute
"""

import os
import sys
import django
import time

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from interviews.models import Interview, VideoResponse, AIAnalysis
from interviews.ai_service import get_ai_service

def reprocess_interview_with_rate_limiting(interview_id):
    """Reprocess interview with rate limiting"""
    
    print(f"\n{'='*60}")
    print(f"Reprocessing Interview {interview_id} with Rate Limiting")
    print(f"{'='*60}\n")
    
    # Get interview
    try:
        interview = Interview.objects.get(id=interview_id)
    except Interview.DoesNotExist:
        print(f"❌ Interview {interview_id} not found!")
        return
    
    print(f"Interview: {interview.id}")
    print(f"Applicant: {interview.applicant.first_name} {interview.applicant.last_name}")
    print(f"Status: {interview.status}")
    
    # Get videos without AI analysis
    videos = interview.video_responses.filter(ai_analysis__isnull=True)
    total = videos.count()
    
    print(f"Videos to process: {total}\n")
    
    if total == 0:
        print("✅ All videos already have AI analysis!")
        return
    
    # Initialize AI service
    try:
        ai_service = get_ai_service()
        print("✅ AI service initialized\n")
    except Exception as e:
        print(f"❌ Failed to initialize AI service: {e}")
        return
    
    # Process each video with rate limiting
    success_count = 0
    error_count = 0
    
    # Delay between each video to avoid hitting quota
    # 5 videos * 2 API calls each = 10 calls
    # Need to spread over 60+ seconds to stay under 10/min
    DELAY_BETWEEN_VIDEOS = 15  # 15 seconds between videos = 20 seconds total for 5 videos with processing time
    
    for i, video in enumerate(videos, 1):
        print(f"\n{'─'*60}")
        print(f"[{i}/{total}] Processing Video {video.id}")
        print(f"{'─'*60}")
        
        try:
            # Get full file path
            video_path = video.video_file_path.path
            print(f"📁 Video: {os.path.basename(video_path)}")
            print(f"❓ Question: {video.question.question_text[:50]}...")
            
            # Step 1: Transcribe (with built-in rate limiting)
            print(f"\n🎤 Transcribing...")
            transcript = ai_service.transcribe_video(video_path, video_response_id=video.id)
            print(f"✅ Transcript ({len(transcript)} chars): {transcript[:100]}...")
            
            # Wait before analysis call to avoid quota
            print(f"\n⏳ Waiting 8 seconds before analysis...")
            time.sleep(8)
            
            # Step 2: Analyze (second API call)
            print(f"\n📊 Analyzing...")
            analysis_result = ai_service.analyze_transcript(
                transcript_text=transcript,
                question_text=video.question.question_text,
                question_type=video.question.question_type.name if video.question.question_type else 'general'
            )
            
            # Check if technical issue
            is_technical_issue = analysis_result.get('technical_issue', False)
            
            if is_technical_issue:
                print(f"⚠️  Technical issue detected (no audio)")
                video.transcript = transcript
                video.ai_score = None
                video.sentiment = None
                video.processed = True
                video.status = 'analyzed'
                video.save()
                success_count += 1
            else:
                # Create AI analysis
                print(f"💾 Saving AI analysis...")
                AIAnalysis.objects.create(
                    video_response=video,
                    transcript_text=transcript,
                    sentiment_score=analysis_result.get('sentiment_score', 50.0),
                    confidence_score=analysis_result.get('confidence_score', 50.0),
                    speech_clarity_score=analysis_result.get('speech_clarity_score', 50.0),
                    content_relevance_score=analysis_result.get('content_relevance_score', 50.0),
                    overall_score=analysis_result.get('overall_score', 50.0),
                    recommendation=analysis_result.get('recommendation', 'review'),
                    body_language_analysis={},
                    langchain_analysis_data=analysis_result
                )
                
                # Update video
                video.transcript = transcript
                video.ai_score = analysis_result.get('overall_score', 50.0)
                video.sentiment = analysis_result.get('sentiment_score', 50.0)
                video.processed = True
                video.status = 'analyzed'
                video.save()
                
                print(f"✅ Success! Score: {video.ai_score}/100")
                success_count += 1
            
            # Wait before next video (except for last one)
            if i < total:
                print(f"\n⏳ Waiting {DELAY_BETWEEN_VIDEOS} seconds before next video...")
                time.sleep(DELAY_BETWEEN_VIDEOS)
            
        except Exception as e:
            print(f"❌ Error processing video {video.id}: {str(e)}")
            error_count += 1
            
            # If quota error, wait longer
            if "quota" in str(e).lower() or "429" in str(e):
                print(f"⚠️  API quota exceeded. Waiting 60 seconds...")
                time.sleep(60)
    
    # Summary
    print(f"\n{'='*60}")
    print(f"✅ Successfully processed: {success_count}/{total}")
    if error_count > 0:
        print(f"❌ Failed: {error_count}/{total}")
    print(f"{'='*60}\n")
    
    # Update interview result if all processed
    if success_count == total:
        print("📊 Updating interview result...")
        from results.models import InterviewResult
        from django.db.models import Avg
        
        avg_score = interview.video_responses.filter(ai_score__isnull=False).aggregate(avg=Avg('ai_score'))['avg']
        
        if avg_score is not None:
            passed = avg_score >= 70.0
            result, created = InterviewResult.objects.get_or_create(
                interview=interview,
                defaults={
                    'applicant': interview.applicant,
                    'final_score': round(avg_score, 2),
                    'passed': passed
                }
            )
            
            if not created:
                result.final_score = round(avg_score, 2)
                result.passed = passed
                result.save()
            
            print(f"✅ Interview Result: {result.final_score}/100")
            
            # Update applicant status
            applicant = interview.applicant
            if avg_score < 50:
                applicant.status = 'failed'
            elif avg_score >= 70:
                applicant.status = 'passed'
            else:
                applicant.status = 'in_review'
            applicant.save()
            print(f"✅ Applicant status: {applicant.status}")

if __name__ == '__main__':
    reprocess_interview_with_rate_limiting(47)
