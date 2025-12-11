# Diagnostic Script: Check Interview Recording Status

"""
Run this script to diagnose why only question 1 is being recorded.
This will check:
1. How many VideoResponse records exist for the interview
2. Which question IDs were recorded
3. Whether transcripts are present
4. Any errors in the uploads
"""

import sys
import os
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from interviews.models import Interview, VideoResponse, InterviewQuestion

def diagnose_interview(interview_id):
    """Check recording status for an interview"""
    
    print("\n" + "="*70)
    print(f"Interview Recording Diagnostic - Interview #{interview_id}")
    print("="*70)
    
    try:
        interview = Interview.objects.get(id=interview_id)
    except Interview.DoesNotExist:
        print(f"\n❌ Interview #{interview_id} not found!")
        return
    
    print(f"\n📋 Interview Details:")
    print(f"   Applicant: {interview.applicant}")
    print(f"   Status: {interview.status}")
    print(f"   Position Type: {interview.position_type}")
    print(f"   Created: {interview.created_at}")
    
    # Get questions for this position
    if interview.position_type:
        questions = InterviewQuestion.objects.filter(
            position_type=interview.position_type,
            is_active=True
        )
        print(f"\n📝 Questions for {interview.position_type}:")
        print(f"   Total questions: {questions.count()}")
        for q in questions:
            print(f"   - Q{q.id}: {q.question_text[:50]}...")
    else:
        questions = InterviewQuestion.objects.filter(is_active=True)
        print(f"\n📝 Generic Questions:")
        print(f"   Total questions: {questions.count()}")
    
    # Get video responses
    video_responses = VideoResponse.objects.filter(interview=interview)
    print(f"\n🎥 Video Responses:")
    print(f"   Total recorded: {video_responses.count()}")
    
    if video_responses.count() == 0:
        print("\n❌ NO VIDEOS RECORDED!")
        print("   Check frontend logs for upload errors")
        return
    
    print(f"\n   Details:")
    for vr in video_responses:
        transcript_status = "✓" if vr.transcript else "✗"
        print(f"   - Q{vr.question.id}: {vr.status} | Transcript: {transcript_status} | Duration: {vr.duration}")
        if vr.transcript:
            print(f"      Transcript preview: {vr.transcript[:80]}...")
    
    # Check for missing questions
    recorded_question_ids = set(vr.question.id for vr in video_responses)
    expected_question_ids = set(q.id for q in questions)
    missing_question_ids = expected_question_ids - recorded_question_ids
    
    if missing_question_ids:
        print(f"\n⚠️  Missing Responses:")
        missing_questions = questions.filter(id__in=missing_question_ids)
        for q in missing_questions:
            print(f"   - Q{q.id}: {q.question_text[:60]}...")
    else:
        print(f"\n✅ All questions answered!")
    
    # Summary
    print(f"\n" + "="*70)
    print(f"Summary:")
    print(f"="*70)
    print(f"   Expected: {questions.count()} questions")
    print(f"   Recorded: {video_responses.count()} videos")
    print(f"   Missing:  {len(missing_question_ids)} questions")
    
    if video_responses.count() == questions.count():
        print(f"\n✅ All questions recorded - ready to submit!")
    elif video_responses.count() == 1:
        print(f"\n❌ PROBLEM: Only 1 question recorded (should be {questions.count()})")
        print(f"\nPossible causes:")
        print(f"   1. Frontend state (recordedVideos) not updating correctly")
        print(f"   2. Upload errors after first question")
        print(f"   3. Auto-advance not working properly")
        print(f"\nCheck:")
        print(f"   - Browser console logs")
        print(f"   - Django server logs")
        print(f"   - Network tab in DevTools")
    else:
        print(f"\n⚠️  Partial recording: {video_responses.count()} of {questions.count()}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        interview_id = int(sys.argv[1])
    else:
        # Get most recent interview
        latest = Interview.objects.latest('created_at')
        interview_id = latest.id
        print(f"No interview ID provided, using latest: #{interview_id}")
    
    diagnose_interview(interview_id)
    
    print(f"\n" + "="*70)
    print(f"Usage: python diagnostic_interview.py [interview_id]")
    print(f"="*70)
