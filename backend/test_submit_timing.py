# Test Script: Verify Interview Submit Returns Immediately

import time
import requests

# Configuration
BASE_URL = "http://localhost:8000"
INTERVIEW_ID = 49  # Change this to your test interview ID

def test_submit_timing():
    """Test that submit endpoint returns quickly (1-2 seconds, not 2 minutes)"""
    
    print("\n" + "="*70)
    print("Testing Interview Submit Response Time")
    print("="*70)
    
    submit_url = f"{BASE_URL}/api/interviews/{INTERVIEW_ID}/submit/"
    
    print(f"\nSubmitting interview {INTERVIEW_ID}...")
    print(f"URL: {submit_url}")
    
    # Measure time
    start_time = time.time()
    
    try:
        response = requests.post(submit_url)
        elapsed_time = time.time() - start_time
        
        print(f"\n✓ Response received in {elapsed_time:.2f} seconds")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data}")
            
            # Check timing
            if elapsed_time < 5:
                print(f"\n✅ PASS: Response returned quickly ({elapsed_time:.2f}s)")
                print("   Backend is using async processing correctly!")
            elif elapsed_time < 30:
                print(f"\n⚠️  WARNING: Response took {elapsed_time:.2f}s")
                print("   Expected < 5 seconds. Check for blocking operations.")
            else:
                print(f"\n❌ FAIL: Response took {elapsed_time:.2f}s")
                print("   Backend is waiting for processing to complete (thread not async)")
        else:
            print(f"\n❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print(f"\n❌ ERROR: Could not connect to {BASE_URL}")
        print("   Make sure Django server is running: python manage.py runserver")
    except Exception as e:
        print(f"\n❌ ERROR: {e}")

def test_recorded_videos():
    """Verify all questions were recorded"""
    
    print("\n" + "="*70)
    print("Checking Recorded Videos in Database")
    print("="*70)
    
    # This would require Django ORM access, skipping for now
    print("\n(Skipped - use Django admin or shell to verify)")
    print("Run: python manage.py shell")
    print(">>> from interviews.models import VideoResponse")
    print(f">>> VideoResponse.objects.filter(interview_id={INTERVIEW_ID}).count()")

if __name__ == "__main__":
    test_submit_timing()
    test_recorded_videos()
    
    print("\n" + "="*70)
    print("Test Complete")
    print("="*70)
    print("\nExpected Results:")
    print("  ✓ Submit returns in < 5 seconds")
    print("  ✓ All questions have VideoResponse records")
    print("  ✓ Processing happens in background")
    print("\nTo check processing status:")
    print(f"  curl {BASE_URL}/api/interviews/{INTERVIEW_ID}/processing-status/")
