#!/usr/bin/env python3
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen, Request
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(dotenv_path=ROOT / ".env")
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
BOOTSTRAP_MARKER = ROOT / ".bootstrapped"

REQUIRED_ENV = [
    "DJANGO_SECRET_KEY",
    "DEEPGRAM_API_KEY",
    "GEMINI_API_KEY",
    "REDIS_URL",
    "CELERY_BROKER_URL",
    "NEXT_PUBLIC_API_BASE_URL",
]

DB_ENV = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"]


def log(step, message):
    print(f"[{step}] {message}")


def fail(message, code=1):
    print(f"[FAIL] {message}")
    sys.exit(code)


def check_python_version():
    if sys.version_info < (3, 8):
        fail("Python 3.8+ is required")
    log("CHECK", f"Python {sys.version.split()[0]} OK")


def require_cmd(name):
    path = shutil.which(name)
    if not path:
        fail(f"Required command not found: {name}")
    log("CHECK", f"Found {name} at {path}")
    return path


def check_env_vars():
    missing = [key for key in REQUIRED_ENV if not os.getenv(key)]
    if missing:
        fail(f"Missing required env vars: {', '.join(missing)}")

    if not os.getenv("DATABASE_URL"):
        missing_db = [key for key in DB_ENV if not os.getenv(key)]
        if missing_db:
            fail("Missing DATABASE_URL or DB_* vars: " + ", ".join(missing_db))

    log("CHECK", "Environment variables OK")


def parse_host_port_from_url(url, default_port):
    parsed = urlparse(url)
    host = parsed.hostname or "localhost"
    port = parsed.port or default_port
    return host, port


def check_tcp_service(host, port, name, timeout=3):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            log("CHECK", f"{name} reachable at {host}:{port}")
            return True
    except Exception as exc:
        fail(f"{name} not reachable at {host}:{port} ({exc})")


def check_redis():
    redis_url = os.getenv("REDIS_URL")
    host, port = parse_host_port_from_url(redis_url, 6379)
    check_tcp_service(host, port, "Redis")


def check_postgres():
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        host, port = parse_host_port_from_url(database_url, 5432)
    else:
        host = os.getenv("DB_HOST", "localhost")
        port = int(os.getenv("DB_PORT", "5432"))
    check_tcp_service(host, port, "PostgreSQL")


def run_cmd(cmd, cwd=None, check=True, capture=False):
    log("RUN", " ".join(cmd))
    if capture:
        return subprocess.run(cmd, cwd=cwd, check=check, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return subprocess.run(cmd, cwd=cwd, check=check)


def require_systemd_service(service_name):
    if not shutil.which("systemctl"):
        fail("systemctl not found for systemd validation")
    result = subprocess.run(["systemctl", "is-active", "--quiet", service_name])
    if result.returncode != 0:
        fail(f"Required systemd service inactive: {service_name}")
    log("CHECK", f"systemd service active: {service_name}")


def require_redis_service():
    for service in ["redis", "redis-server"]:
        if subprocess.run(["systemctl", "is-active", "--quiet", service]).returncode == 0:
            log("CHECK", f"systemd service active: {service}")
            return
    fail("Required systemd service inactive: redis or redis-server")


def check_url(url, name, timeout=5, ok_statuses=None):
    ok_statuses = ok_statuses or {200}
    req = Request(url, headers={"User-Agent": "hirenowpro-bootstrap"})
    with urlopen(req, timeout=timeout) as response:
        status = response.getcode()
        body = response.read()
    if status not in ok_statuses:
        fail(f"{name} health check failed for {url} with status {status}")
    log("CHECK", f"{name} OK ({status})")
    return body


def health_checks():
    backend_url = os.getenv("BACKEND_HEALTH_URL", "/admin/")
    frontend_url = os.getenv("FRONTEND_URL")
    if not frontend_url:
        fail("FRONTEND_URL must be set to the production Nginx domain (https)")
    parsed_frontend = urlparse(frontend_url)
    if parsed_frontend.scheme != "https":
        fail("FRONTEND_URL must use https")
    if parsed_frontend.hostname in {"localhost", "127.0.0.1"}:
        fail("FRONTEND_URL must not be localhost")
    if backend_url.startswith("/"):
        backend_url = frontend_url.rstrip("/") + backend_url
    log("CHECK", f"Backend health URL resolved to {backend_url}")

    for attempt in range(1, 6):
        try:
            body = check_url(backend_url, "Backend", ok_statuses={200, 301, 302})
            try:
                payload = json.loads(body.decode("utf-8"))
                if payload.get("status") != "ok":
                    fail(f"Backend health returned {payload}")
            except Exception:
                pass
            check_url(frontend_url, "Frontend")
            return True
        except Exception as exc:
            log("WAIT", f"Health check attempt {attempt} failed: {exc}")
            time.sleep(2)

    fail("Health checks failed")


def check_celery_ping():
    celery_app = os.getenv("CELERY_APP", "core")
    result = run_cmd(["celery", "-A", celery_app, "inspect", "ping"], cwd=str(BACKEND_DIR), capture=True, check=False)
    output = (result.stdout or "").strip()
    if result.returncode != 0:
        fail(f"Celery ping failed: {output or 'no output'}")
    if "pong" not in output.lower():
        fail(f"Celery ping returned no pong: {output or 'no output'}")
    log("CHECK", "Celery workers responsive")


def guard_production_env():
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        fail("Refusing to run as root")
    if os.getenv("ENV") != "production":
        fail("ENV=production is required for verification")


def main():
    log("VERIFY", "HireNowPro production verification starting")
    guard_production_env()
    if BOOTSTRAP_MARKER.exists() and os.getenv("FORCE_BOOTSTRAP") != "1":
        log("SKIP", "Verification already completed (set FORCE_BOOTSTRAP=1 to re-run)")
        sys.exit(0)

    check_python_version()
    require_cmd("systemctl")
    require_cmd("celery")

    check_env_vars()
    require_redis_service()
    require_systemd_service("gunicorn")
    require_systemd_service("celery")
    require_systemd_service("nginx")

    check_redis()
    check_postgres()
    check_tcp_service("127.0.0.1", 8000, "Gunicorn")
    check_celery_ping()
    health_checks()

    BOOTSTRAP_MARKER.touch()
    log("DONE", "Production verification completed successfully")


if __name__ == "__main__":
    main()
