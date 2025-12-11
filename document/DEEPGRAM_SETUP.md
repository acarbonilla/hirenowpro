# Quick Setup: Deepgram STT Pipeline

## 🚀 Installation Steps

### 1. Install Dependencies

```powershell
cd backend
pip install deepgram-sdk==3.7.2 ffmpeg-python==0.2.0
```

### 2. Get Deepgram API Key

1. Sign up at: https://console.deepgram.com/
2. Create a new API key
3. Copy the API key

### 3. Add to Environment

Edit your `.env` file:

```env
# Add this line
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

### 4. Install FFmpeg (if not installed)

**Windows:**

```powershell
# Using Chocolatey
choco install ffmpeg

# OR download from: https://ffmpeg.org/download.html
```

**Verify installation:**

```powershell
ffmpeg -version
```

### 5. Restart Django Server

```powershell
cd backend
python manage.py runserver
```

---

## ✅ Test the New Interview Flow

This section reflects the **new pipeline**:

- Deepgram STT runs **right after each answer** is uploaded.
- Transcripts are stored on each `VideoResponse`.
- On submit, the backend runs **one batch Gemini analysis** using the saved transcripts.
- HR sees results in the dashboard; applicants can close the tab and wait for email/HR follow‑up.

### 1. Open Interview (Applicant)

Navigate to: `http://localhost:3000/interview/<interview_id>` (e.g. `/interview/49`).

### 2. Answer Questions – Deepgram per upload

For each question:

- Recording starts automatically after TTS reads the question.
- When recording stops, the video is uploaded.
- **Watch the Django console** – for each upload you should see logs like:

  ```
  🎤 Starting Deepgram transcription for video 123...
  🎵 Extracting audio from video...
  ✅ Deepgram transcription complete in 2.3s
  📊 Logged Deepgram usage: 18.50s audio, words=47
  ```

- The upload request should finish in ~2–4 seconds per question.
- In the database, each `VideoResponse.transcript` is now filled immediately.

### 3. Submit Interview – Batch LLM Only

- After all questions are answered, click **Submit Interview**.
- The frontend calls `POST /api/interviews/<id>/submit/`, then quickly redirects to `/processing/<id>`.
- The backend **does not re‑transcribe** videos if transcripts already exist; it only:
  - Fills any missing transcripts (fallback), then
  - Calls `batch_analyze_transcripts` once with all transcripts.
- In the Django console you should see e.g.:

  ```
  ✅ All validations passed!
  📊 Running batch LLM analysis for 5 transcripts...
  ✓ Saved LLM analysis for video 201
  ...
  ✓ Interview 56 processed successfully!
  ```

Processing time here is mostly Gemini analysis (not Deepgram).

### 4. View Results (HR)

- HR logs into the dashboard and opens:
  - `/hr-dashboard/results` – list of processed interviews.
  - `/hr-dashboard/history` – history of completed interviews.
- Opening a specific result (e.g. `/hr-dashboard/results/<id>/review`) shows:
  - Overall score and pass / in‑review / failed.
  - Per‑question scores and sentiment.
  - Transcripts coming from Deepgram.

Optional: a notification task (`send_result_notification`) can email HR/applicants once the result is ready.

---

## 🔍 Verify Transcripts

```powershell
cd backend
python manage.py shell
```

```python
from interviews.models import VideoResponse

# Get latest video response
vr = VideoResponse.objects.last()
print(f"Transcript: {vr.transcript}")
print(f"Length: {len(vr.transcript)} chars")
```

---

## 🐛 Troubleshooting

### Error: "DEEPGRAM_API_KEY not configured"

**Solution:** Add API key to `.env` file and restart server

### Error: "ffmpeg not found"

**Solution:** Install ffmpeg:

```powershell
choco install ffmpeg
# OR download from https://ffmpeg.org/
```

### Error: "Failed to extract audio"

**Solution:** Check video file format. Supported: mp4, webm

### Transcripts are empty

**Solution:**

1. Check Deepgram API key is valid
2. Check video has audio
3. Check console for error messages

---

## 📊 Expected Results

### Before (Old Pipeline)

- ❌ Each upload: ~45 seconds (Gemini video transcription per question)
- ❌ Total time: ~225 seconds
- ❌ 10 Gemini API calls (5 transcription + 5 analysis)

### After (New Pipeline with Deepgram)

- ✅ Each upload (Deepgram STT): ~3 seconds
- ✅ Total time (5 uploads + 1 batch LLM): ~20–30 seconds on a dev machine
- ✅ 1 Gemini API call (batch analysis) + 5 Deepgram calls (STT)

### With Redis + Celery (Optional Enhancement)

- ✅ Each upload: ~3 seconds (same as above)
- ✅ Submit response: **1-2 seconds** (instant!)
- ✅ Background processing: ~120 seconds (user doesn't wait)
- ✅ User can close browser after submit

**See `REDIS_SETUP_SUMMARY.md` for setup instructions**

---

## 💡 Tips

1. **Monitor logs** - Console shows transcription progress
2. **Check database** - Transcripts stored immediately
3. **Test with real audio** - Speak clearly for best results
4. **Fallback works** - Empty transcripts are re-transcribed on submit

---

## 📞 Support

- **Deepgram Docs**: https://developers.deepgram.com/
- **API Console**: https://console.deepgram.com/
- **Pricing**: https://deepgram.com/pricing

---

**Next Steps:**

1. Install dependencies ✅
2. Add API key ✅
3. Test interview flow ✅
4. Monitor performance ✅
5. **(Optional)** Set up Redis + Celery for instant submit → See `REDIS_SETUP_SUMMARY.md`

---

## 🚀 Performance Enhancement: Redis + Celery

### Current Behavior (Thread Fallback)

- Upload: ~3 seconds per question ✅
- Submit: **~2 minutes** (HTTP waits for Gemini) ⚠️

### With Redis + Celery

- Upload: ~3 seconds per question ✅
- Submit: **1-2 seconds** (returns immediately) ✅
- Analysis: ~2 minutes in background (user doesn't wait) ✅

**Your code already supports both modes!** Redis is optional but recommended for production.

**Quick Setup:**

```powershell
# Install Redis (Docker)
docker run -d -p 6379:6379 --name redis-hirenow redis:alpine

# Start Celery worker
cd backend
celery -A core worker --loglevel=info --pool=solo

# That's it! Submit now returns in 1-2 seconds
```

**Full documentation:**

- **Complete guide:** `REDIS_CELERY_SETUP.md`
- **Quick start:** `QUICK_START_REDIS.md`
- **Summary:** `REDIS_SETUP_SUMMARY.md`
- **Auto installer:** Run `backend\install_redis.ps1`
