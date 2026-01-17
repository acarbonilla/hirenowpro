# HireNowPro Short-Term Production Guide (1 Week)

This is a minimal, safe checklist for a short-lived production deploy.
Goal: stable runtime, manual deploys, single server.

## Environment Variables

Backend (Django):
- DJANGO_DEBUG=false
- DJANGO_SECRET_KEY=...
- APPLICANT_SECRET=...
- ALLOWED_HOSTS=yourdomain.com,api.yourdomain.com
- CORS_ALLOWED_ORIGINS=https://yourdomain.com
- DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT
- REDIS_HOST / REDIS_PORT / REDIS_DB
- CELERY_BROKER_URL=redis://host:port/db
- CELERY_RESULT_BACKEND=redis://host:port/db
- DEEPGRAM_API_KEY=...
- GEMINI_API_KEY=...
- OPENAI_API_KEY=... (if used)
- DEEPGRAM_TTS_MODEL=aura-2-thalia-en
- FRONTEND_BASE_URL=https://yourdomain.com

Frontend (Next.js):
- DEPLOYMENT_ENV=production
- NEXT_PUBLIC_API_BASE_URL=https://yourdomain.com/api
- NEXT_PUBLIC_APP_NAME=HireNowPro
- NEXT_PUBLIC_MAX_VIDEO_DURATION=120

## Frontend (Next.js)

Build and run on internal port 3000:

```
cd frontend
npm install
npm run build
npm run start
```

Notes:
- Only `npm run start` for production, not `next dev`.
- Ensure all `NEXT_PUBLIC_*` values are set in the runtime env.

## Backend (Django + Gunicorn)

Run on internal port 8000:

```
cd backend
python -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python manage.py migrate
venv/bin/python manage.py collectstatic --noinput
venv/bin/gunicorn core.wsgi:application \
  --workers 3 \
  --bind 127.0.0.1:8000 \
  --timeout 120
```

Notes:
- `DEBUG` must be false in production.
- `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` must include your domain.
- `media/` must be writable by the Gunicorn user.

## Redis

- No persistence required for 1-week run.
- Ensure Redis is reachable at `REDIS_HOST:REDIS_PORT`.

## Celery

Run worker from `backend/`:

```
celery -A core worker -l info
```

Notes:
- `CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True` is enabled.
- If the worker restarts, pending interviews should continue normally.

## PostgreSQL

- Verify connection and run migrations.
- Backups optional for short-term, but a quick `pg_dump` is still recommended.

## Nginx (Reverse Proxy)

Key routes:
- `/` -> Next.js (localhost:3000)
- `/api/` -> Django (localhost:8000)
- `/media/` -> Django media
- `/static/` -> Django static

Example server block (adjust paths and domain):

```
server {
  listen 80;
  server_name yourdomain.com;

  client_max_body_size 200m;

  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

  location /static/ {
    alias /path/to/backend/static/;
  }

  location /media/ {
    alias /path/to/backend/media/;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300;
    proxy_send_timeout 300;
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120;
    proxy_send_timeout 120;
  }
}
```

## Startup Order

1. PostgreSQL
2. Redis
3. Django (Gunicorn)
4. Celery worker
5. Next.js
6. Nginx

## Health Checks

- API health: `GET /api/health/` (returns DB/Redis status)
- Redis: verify health endpoint shows `redis=ok`
- Celery: run `celery -A core inspect ping` and confirm worker responds
- Public flow: create an interview and submit to ensure pipeline runs end-to-end

## One-Command Restart (Example)

If using systemd, set service names and restart all:

```
sudo systemctl restart hirenowpro-gunicorn hirenowpro-celery hirenowpro-next nginx
```

## Known Failure Points

- Missing `DJANGO_SECRET_KEY` or `APPLICANT_SECRET` causes startup failure.
- `ALLOWED_HOSTS` / `CORS_ALLOWED_ORIGINS` mis-match breaks frontend requests.
- Redis down -> Celery and cache failures (watch `celery` logs).
- Large uploads require `client_max_body_size` and timeouts in Nginx.
- `media/` permissions can block video uploads.
- Static files not collected or Nginx alias path incorrect.
