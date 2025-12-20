
import os
import sys
import django

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from interviews.deepgram_service import get_deepgram_service

def test_transcription():
    # Use the specific valid file we found
    video_path = "media/video_responses/2025/12/13/question_3_1765604393378.webm"
    
    print(f"Testing with file: {video_path}")
    if not os.path.exists(video_path):
        print("Error: Test video not found!")
        return
        
    print(f"File size: {os.path.getsize(video_path)} bytes")

    try:
        service = get_deepgram_service()
        print("Service initialized. calling transcribe_video...")
        result = service.transcribe_video(video_path)
        print("SUCCESS:", result)
    except Exception as e:
        print("FAILURE:", e)
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_transcription()
