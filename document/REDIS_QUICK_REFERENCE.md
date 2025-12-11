# Redis + Celery Quick Reference Card

## 🎯 The Problem & Solution

**Problem:** Interview submit takes 2 minutes (HTTP waits for Gemini)
**Solution:** Redis + Celery = Instant response (1-2 seconds)

---

## ⚡ Quick Commands

### Installation (Choose One)

**Docker (Recommended):**

```powershell
docker run -d -p 6379:6379 --name redis-hirenow --restart always redis:alpine
```

**WSL:**

```powershell
wsl sudo apt update && sudo apt install redis-server -y && sudo service redis-server start
```

**Automated:**

```powershell
cd backend
.\install_redis.ps1
```

### Start Development Environment

**Terminal 1: Redis (Docker)**

```powershell
docker start redis-hirenow
```

**Terminal 2: Django**

```powershell
cd backend
python manage.py runserver
```

**Terminal 3: Celery Worker**

```powershell
cd backend
& .\venv\Scripts\Activate.ps1
celery -A core worker --loglevel=info --pool=solo
```

**Terminal 4: Frontend**

```powershell
cd frontend
npm run dev
```

### Verify Setup

**Check Redis:**

```powershell
docker exec redis-hirenow redis-cli ping  # Should return: PONG
```

**Check Celery:**
Look for in Celery terminal:

```
[tasks]
  . interviews.tasks.process_complete_interview
Ready to accept tasks
```

**Test Submit:**

- Submit interview
- Should return in 1-2 seconds
- Check Celery terminal for task processing

---

## 🔍 Monitoring

### Django Logs (Terminal 2)

```
✓ Celery task queued for interview 49     ← Good! Using Redis
⚠ Redis/Celery not available              ← Using thread fallback
```

### Celery Logs (Terminal 3)

```
Task interviews.tasks.process_complete_interview[abc-123] received
Starting bulk processing for interview 49
📊 Running batch LLM analysis for 5 transcripts...
✓ Interview 49 processed successfully!
Task succeeded in 123.4s
```

---

## 🐛 Troubleshooting

| Problem               | Solution                                  |
| --------------------- | ----------------------------------------- |
| "redis-cli not found" | Install Redis (see commands above)        |
| "Connection refused"  | Start Redis: `docker start redis-hirenow` |
| "Still 2-minute wait" | Check if Celery worker is running         |
| "Task not processing" | Restart Celery worker, check logs         |
| "ModuleNotFoundError" | Run Celery from `backend/` directory      |

---

## 📊 Performance

| Metric            | Without Redis | With Redis | Improvement  |
| ----------------- | ------------- | ---------- | ------------ |
| Upload per Q      | 3 seconds     | 3 seconds  | Same         |
| Submit response   | 120 seconds   | 2 seconds  | **98%** ✅   |
| Total user wait   | 135 seconds   | 17 seconds | **87%** ✅   |
| Can close browser | ❌ No         | ✅ Yes     | Better UX ✅ |

---

## 🎯 When to Use

**Thread Fallback (No Redis):**

- ✅ Local development
- ✅ Quick testing
- ✅ Zero setup
- ⚠️ 2-minute wait acceptable

**Redis + Celery:**

- ✅ Production environments
- ✅ Staging environments
- ✅ When testing full flow
- ✅ When instant response needed

---

## 📚 Full Documentation

- **Complete setup:** `REDIS_CELERY_SETUP.md`
- **Quick start:** `QUICK_START_REDIS.md`
- **Summary:** `REDIS_SETUP_SUMMARY.md`
- **Flow diagrams:** `FLOW_DIAGRAMS.md`
- **Auto installer:** `backend/install_redis.ps1`

---

## 🚀 Production Deployment

```bash
# Install Redis
sudo apt install redis-server

# Configure Celery service
sudo nano /etc/systemd/system/celery.service

# Enable and start
sudo systemctl enable celery redis
sudo systemctl start celery redis
```

Full production config in `REDIS_CELERY_SETUP.md`

---

## ✨ Key Points

1. **Your code already works both ways** - no changes needed
2. **Thread fallback is fine for dev** - 2-minute wait is acceptable
3. **Redis recommended for production** - instant response + scalability
4. **Easy to switch** - just install Redis and start worker
5. **No downtime migration** - fallback ensures continuous operation

---

## 🎯 Bottom Line

```
Without Redis: Works fine, 2-minute wait on submit
With Redis:    Works better, 2-second wait on submit

Installation: 2 commands (Docker + Celery worker)
Code changes: NONE (already implemented)
```

**Recommendation:**

- Dev: Use thread fallback (simpler)
- Prod: Use Redis + Celery (better UX)

---

**Need help? See full docs or run `.\install_redis.ps1`**
