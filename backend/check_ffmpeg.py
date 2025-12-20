
import subprocess
import sys
import os

def check_ffmpeg():
    print(f"PATH: {os.environ.get('PATH')}")
    try:
        # Try running ffmpeg directly
        result = subprocess.run(['ffmpeg', '-version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        print("FFmpeg found via subprocess!")
        print(result.stdout.split('\n')[0])
        return True
    except FileNotFoundError:
        print("FFmpeg NOT found in PATH")
        return False
    except Exception as e:
        print(f"Error checking ffmpeg: {e}")
        return False

if __name__ == "__main__":
    check_ffmpeg()
