
import os
import sys
from dotenv import load_dotenv

load_dotenv()

key = os.getenv('DEEPGRAM_API_KEY')
if key:
    print(f"DEEPGRAM_API_KEY is found (length: {len(key)})")
    if key.strip() == "":
        print("Error: Key is empty string")
    else:
        print(f"Key starts with: {key[:4]}...")
else:
    print("DEEPGRAM_API_KEY NOT found in environment")
