# Quick Start: Redis + Celery Setup

## 🚀 TL;DR - Get Started in 5 Minutes

### Your Current Setup

- ✅ Code is ready (Celery tasks exist)
- ✅ `.env` configured with Redis settings
- ✅ Dependencies in `requirements.txt`
- ❌ Redis not installed → using thread fallback (2-minute wait)

### To Eliminate 2-Minute Wait

**Step 1: Install Redis (Choose One)**

**Option A: Docker (Easiest - Recommended)**

```powershell
# Install Docker Desktop from: https://www.docker.com/products/docker-desktop/
# Then run:
docker run -d -p 6379:6379 --name redis-hirenow --restart always redis:alpine
```

**Option B: WSL (Linux Subsystem)**

```powershell
# Install WSL if not already installed
wsl --install

# Inside WSL terminal:
sudo apt update
sudo apt install redis-server -y
sudo service redis-server start
```

**Option C: Native Windows (Manual)**

```powershell
# Download Redis from:
# https://github.com/microsoftarchive/redis/releases
# Extract and run redis-server.exe
```

**Step 2: Start Celery Worker**

Open a **new terminal** in your project:

```powershell
cd backend
& .\venv\Scripts\Activate.ps1
celery -A core worker --loglevel=info --pool=solo
```

> Keep this terminal open while testing!

**Step 3: Test It**

1. Start Django: `python manage.py runserver`
2. Go to: `http://localhost:3000/interview/<id>`
3. Answer questions and submit
4. **Should now return in 1-2 seconds!** ✨

---

## 📋 Verification Checklist

### Is Redis Running?

```powershell
# If using Docker:
docker ps | Select-String redis

# If using WSL:
wsl
sudo service redis-server status
```

### Is Celery Working?

In the Celery terminal, you should see:

```
 -------------- celery@hostname v5.4.0
---- **** -----
--- * ***  * -- Windows-10.0.19041-SP0 2024-12-09 10:30:00
-- * - **** ---
- ** ---------- [config]
- ** ---------- .> app:         hirenowpro:0x...
- ** ---------- .> transport:   redis://localhost:6379/0
...
[tasks]
  . interviews.tasks.process_complete_interview
```

### Test Submit Behavior

**Before Redis (Thread Fallback):**

```
Browser → Submit → [waits 2 minutes] → Redirect
Django logs: "⚠ Redis/Celery not available, starting synchronous processing"
```

**After Redis + Celery:**

```
Browser → Submit → [returns in 2 seconds] → Redirect
Django logs: "✓ Celery task queued for interview 49"
Celery logs: "Task interviews.tasks.process_complete_interview[abc-123] received"
```

---

## 🎯 Production Deployment

### Recommended Setup

**Development:**

- Option 1: No Redis (use thread fallback - simpler)
- Option 2: Docker Redis (if you want to test real behavior)

**Production/Staging:**

- Always use Redis + Celery
- Run Celery as a service (systemd/supervisor)
- Use proper Redis configuration (persistence, password)

### Production Commands

```bash
# Install Redis on server
sudo apt update
sudo apt install redis-server

# Configure Redis (optional: enable persistence, set password)
sudo nano /etc/redis/redis.conf
# Set: requirepass yourpassword
sudo systemctl restart redis

# Update .env for production
CELERY_BROKER_URL=redis://:yourpassword@localhost:6379/0
CELERY_RESULT_BACKEND=redis://:yourpassword@localhost:6379/0

# Run Celery as a service
sudo nano /etc/systemd/system/celery.service
# (See full config in REDIS_CELERY_SETUP.md)

sudo systemctl enable celery
sudo systemctl start celery
```

---

## 🔄 Current vs. Target Behavior

### Current (No Redis)

```
Submit Interview
    ↓
Django validates (1 sec)
    ↓
Background thread starts
    ↓
HTTP waits for thread (2 min) ← PROBLEM
    ↓
Return response
    ↓
Redirect to completion page
```

### Target (With Redis)

```
Submit Interview
    ↓
Django validates (1 sec)
    ↓
Queue Celery task
    ↓
Return response immediately ← FIXED!
    ↓
Redirect to completion page
    ↓
(Celery worker processes in background)
```

---

## 💡 Key Points

1. **Your code already supports both modes** - it automatically detects if Redis is available

2. **Thread fallback works but has drawbacks:**

   - HTTP blocks for 2 minutes
   - No retry on failure
   - Doesn't scale well

3. **Redis + Celery is production-ready:**

   - Instant HTTP response
   - Automatic retries
   - Horizontal scaling
   - Better monitoring

4. **You can start without Redis** and add it later - no code changes needed!

---

## 📞 Next Steps

**To test with Redis now:**

1. Install Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Run: `docker run -d -p 6379:6379 --name redis-hirenow redis:alpine`
3. Start Celery: `celery -A core worker --loglevel=info --pool=solo`
4. Test interview submission

**To deploy to production:**

1. Follow production setup in `REDIS_CELERY_SETUP.md`
2. Configure systemd service for Celery
3. Set up monitoring (optional: Flower)

**To keep using thread fallback (dev only):**

- Nothing to do! It works as-is, just with the 2-minute wait

---

## 🐛 Troubleshooting

**"redis-cli: command not found"**

- Redis not installed - follow installation steps above

**Celery won't start**

```powershell
# Make sure you're in the backend directory
cd backend

# Activate virtual environment
& .\venv\Scripts\Activate.ps1

# Check if celery is installed
pip list | Select-String celery

# Install if missing
pip install celery redis django-redis
```

**Still seeing 2-minute wait**

- Check if Celery worker is running (separate terminal)
- Check Django logs for "⚠ Redis/Celery not available"
- Verify Redis is running: `docker ps` or `wsl sudo service redis-server status`

**Port 6379 already in use**

```powershell
# Check what's using port 6379
netstat -ano | Select-String 6379

# If old Redis container exists:
docker stop redis-hirenow
docker rm redis-hirenow
```
