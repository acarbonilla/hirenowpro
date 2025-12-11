# Redis + Celery Setup: Eliminate 2-Minute HTTP Wait

## 🎯 What This Solves

**Current Problem:**

- When you submit an interview, the HTTP request waits ~2 minutes while Gemini analyzes all transcripts
- Browser shows "submitting..." for the entire time
- If the browser closes, the analysis might fail

**With Redis + Celery:**

- Submit endpoint returns in **1-2 seconds**
- Gemini analysis runs in a **background worker**
- Applicant sees completion page immediately
- Analysis continues even if browser closes

---

## 🏗️ Architecture Overview

### Without Redis (Current Fallback)

```
Browser → Django → Validate → Background Thread → Gemini (2 min)
          ↓
          Returns after 2 minutes
```

### With Redis + Celery (Recommended)

```
Browser → Django → Validate → Queue Task → Return (1-2 sec)
                                    ↓
                              Celery Worker → Gemini (2 min)
```

---

## 🚀 Setup Instructions

### Option 1: Production Only (Recommended for Starting)

Use Redis in production/staging, keep thread-based processing in dev.

#### 1. Install Redis on Production Server

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Windows (via WSL or Docker):**

```powershell
# Using Docker
docker run -d -p 6379:6379 --name redis redis:alpine

# OR using WSL
wsl -d Ubuntu
sudo apt install redis-server
sudo service redis-server start
```

**Verify Redis:**

```bash
redis-cli ping
# Should return: PONG
```

#### 2. Configure Production Environment

Add to your production `.env` file:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Celery Configuration (same as Redis by default)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

**For cloud deployments (e.g., Railway, Heroku, AWS):**

```env
# Use provided Redis URL
CELERY_BROKER_URL=redis://your-redis-host:6379/0
CELERY_RESULT_BACKEND=redis://your-redis-host:6379/0
```

#### 3. Start Celery Worker on Production

```bash
cd backend

# Single worker (simple)
celery -A core worker --loglevel=info

# Multiple workers (better performance)
celery -A core worker --loglevel=info --concurrency=4

# With beat scheduler (for periodic tasks)
celery -A core worker --loglevel=info --beat
```

**Production: Use Supervisor or systemd**

Create `/etc/systemd/system/celery.service`:

```ini
[Unit]
Description=Celery Worker
After=network.target

[Service]
Type=forking
User=www-data
Group=www-data
WorkingDirectory=/path/to/backend
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/celery -A core worker --loglevel=info --concurrency=4 --logfile=/var/log/celery/worker.log

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable celery
sudo systemctl start celery
sudo systemctl status celery
```

---

### Option 2: Development + Production (Full Setup)

Use Redis everywhere for consistent behavior.

#### 1. Install Redis Locally

**Windows:**

```powershell
# Option A: Using Chocolatey
choco install redis-64

# Option B: Using Docker
docker run -d -p 6379:6379 --name redis-dev redis:alpine

# Option C: Using WSL
wsl -d Ubuntu
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

**macOS:**

```bash
brew install redis
brew services start redis
```

**Linux:**

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Verify:**

```bash
redis-cli ping
# Should return: PONG
```

#### 2. Update Development `.env`

Your `backend/.env` should include:

```env
# Django Settings
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/hirenowpro

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Celery Configuration
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# AI Services
GEMINI_API_KEY=your_gemini_api_key
DEEPGRAM_API_KEY=your_deepgram_api_key
```

#### 3. Install Python Dependencies

Already in `requirements.txt`:

```txt
celery==5.4.0
redis==5.2.0
django-redis==5.4.0
```

Install (if needed):

```powershell
cd backend
pip install celery==5.4.0 redis==5.2.0 django-redis==5.4.0
```

#### 4. Run Development Servers

**Terminal 1: Django**

```powershell
cd backend
python manage.py runserver
```

**Terminal 2: Celery Worker**

```powershell
cd backend
celery -A core worker --loglevel=info --pool=solo
```

> **Note:** Use `--pool=solo` on Windows. On Linux/macOS, omit it or use `--pool=prefork`.

**Terminal 3: Frontend (optional)**

```powershell
cd frontend
npm run dev
```

---

## ✅ Testing the Setup

### 1. Check Redis Connection

```powershell
cd backend
python manage.py shell
```

```python
from django.core.cache import cache

# Test cache
cache.set('test_key', 'Hello Redis!', 30)
result = cache.get('test_key')
print(f"Cache test: {result}")  # Should print: Cache test: Hello Redis!

# Test Celery
from interviews.tasks import process_complete_interview
print("Celery tasks available:", process_complete_interview)
```

### 2. Submit an Interview

1. Open: `http://localhost:3000/interview/<interview_id>`
2. Answer all questions (videos upload with Deepgram STT)
3. Click **Submit Interview**
4. **Expected behavior:**
   - Submit button shows spinner for ~1-2 seconds
   - Redirects to completion page immediately
   - In Celery worker terminal, you see:
     ```
     [2024-12-09 10:30:15] Task interviews.tasks.process_complete_interview[abc-123] received
     Starting bulk processing for interview 49
     📊 Running batch LLM analysis for 5 transcripts...
     ✓ Saved LLM analysis for video 201
     ...
     ✓ Interview 49 processed successfully!
     [2024-12-09 10:32:18] Task interviews.tasks.process_complete_interview[abc-123] succeeded in 123.4s
     ```

### 3. Monitor Processing

**In Django logs (Terminal 1):**

```
✓ Celery task queued for interview 49
```

**In Celery logs (Terminal 2):**

```
[2024-12-09 10:30:15] Starting bulk processing for interview 49
[2024-12-09 10:30:15] 📊 Running batch LLM analysis for 5 transcripts...
[2024-12-09 10:32:18] ✓ Interview 49 processed successfully!
```

### 4. Check Results

HR dashboard should show results ~2 minutes after submission:

- `/hr-dashboard/results` - list of completed interviews
- `/hr-dashboard/results/<id>/review` - detailed results with scores

---

## 🔍 How It Works

### Code Flow

1. **Upload Video (per question):**

   ```python
   # interviews/views.py - video_response()
   video_response = VideoResponse.objects.create(...)

   # Immediate Deepgram transcription (~2-4 seconds)
   transcript = deepgram_service.transcribe_video(video_file)
   video_response.transcript = transcript
   video_response.save()
   ```

2. **Submit Interview:**

   ```python
   # interviews/views.py - submit()
   interview.status = 'submitted'
   interview.save()

   queue_entry = ProcessingQueue.objects.create(...)

   # Try Celery (async), fallback to threading
   try:
       process_complete_interview.delay(interview.id)
       print("✓ Celery task queued")
   except:
       # Start background thread (current fallback)
       threading.Thread(target=process_in_background).start()
       print("⚠ Using thread fallback")

   return Response({...})  # Returns immediately
   ```

3. **Background Processing:**
   ```python
   # interviews/tasks.py - process_complete_interview()
   @shared_task
   def process_complete_interview(interview_id):
       # Get all video responses
       video_responses = interview.video_responses.all()

       # Fallback: transcribe any missing transcripts
       for vr in video_responses:
           if not vr.transcript:
               vr.transcript = deepgram_service.transcribe_video(...)

       # Batch LLM analysis (ONE API call for all transcripts)
       analyses = ai_service.batch_analyze_transcripts(transcripts_data)

       # Save results
       for vr, analysis in zip(video_responses, analyses):
           AIAnalysis.objects.create(...)
           vr.ai_score = analysis['score']
           vr.save()

       # Create interview result
       InterviewResult.objects.create(...)
   ```

---

## 🐛 Troubleshooting

### Issue: "Connection refused" when submitting interview

**Cause:** Redis not running or wrong configuration

**Solution:**

```powershell
# Check Redis status
redis-cli ping

# If not running, start it
# Windows (Docker):
docker start redis-dev

# WSL:
wsl -d Ubuntu
sudo service redis-server start

# Check Django settings
python manage.py shell
from django.conf import settings
print(settings.CELERY_BROKER_URL)
```

### Issue: Celery worker not processing tasks

**Cause:** Worker not started or crashed

**Solution:**

```powershell
# Check if worker is running
ps aux | grep celery

# Restart worker with verbose logging
cd backend
celery -A core worker --loglevel=debug --pool=solo
```

### Issue: Tasks fail with "ModuleNotFoundError"

**Cause:** Celery worker can't find Django modules

**Solution:**

```powershell
# Make sure you're in the backend directory
cd backend

# Verify PYTHONPATH
python -c "import django; print(django.__file__)"

# Run worker from backend directory
celery -A core worker --loglevel=info
```

### Issue: Still seeing 2-minute wait on submit

**Cause:** Celery not running, falling back to threading

**Solution:**

1. Check Celery worker logs
2. Verify Redis connection
3. Look for "⚠ Redis/Celery not available" in Django logs
4. If intentional (dev mode), this is expected behavior

---

## 📊 Performance Comparison

### Without Redis (Thread Fallback)

- ✅ Works without external dependencies
- ✅ Simple setup for development
- ⚠️ HTTP request blocks for ~2 minutes
- ⚠️ No retry mechanism if analysis fails
- ⚠️ Doesn't scale well (limited threads)

### With Redis + Celery

- ✅ HTTP returns in 1-2 seconds
- ✅ Automatic retry on failures
- ✅ Scales horizontally (add more workers)
- ✅ Better monitoring and debugging
- ✅ Proper task queuing and prioritization
- ⚠️ Requires Redis installation
- ⚠️ Extra process to manage (worker)

---

## 🎯 Recommended Deployment Strategy

### Development

**Option A (Simple):** No Redis, use thread fallback

- Pros: No setup, works immediately
- Cons: 2-minute wait on submit

**Option B (Realistic):** Local Redis + Celery

- Pros: Matches production behavior
- Cons: Extra setup, one more terminal window

### Staging/Production

**Always use Redis + Celery:**

- Install Redis on server
- Run Celery worker(s) as systemd service
- Configure supervisor for auto-restart
- Monitor with Flower or similar tools

---

## 📞 Additional Resources

- **Celery Docs:** https://docs.celeryq.dev/
- **Django-Redis:** https://github.com/jazzband/django-redis
- **Redis Quickstart:** https://redis.io/docs/getting-started/
- **Flower (Celery Monitoring):** https://flower.readthedocs.io/

---

## 🔄 Migration Path

### Current State

- ✅ Code supports both Celery and thread fallback
- ✅ Dependencies already in `requirements.txt`
- ✅ Settings already configured in `settings.py`
- ⚠️ Redis not running → using thread fallback

### To Enable Redis

1. **Install Redis** (see instructions above)
2. **Start Celery worker** in separate terminal
3. **Test submission** → should see immediate response
4. **Deploy to production** with systemd service

No code changes needed—just infrastructure setup!

---

## ✨ Summary

**You already have everything in place!** Your code is ready for Redis + Celery:

- `backend/core/celery.py` ✅
- `backend/interviews/tasks.py` with `@shared_task` ✅
- Settings configured for Redis ✅
- Graceful fallback to threading ✅

**To eliminate the 2-minute wait:**

1. Install Redis
2. Start Celery worker
3. That's it!

**For production only:**

- Skip Redis in dev (use thread fallback)
- Set up Redis + Celery in staging/prod
- Submit returns instantly, analysis happens async
