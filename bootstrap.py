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

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
LOG_DIR = ROOT / "logs"

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


def ensure_dirs():
    LOG_DIR.mkdir(exist_ok=True)


def pgrep(pattern):
    if shutil.which("pgrep"):
        result = subprocess.run(["pgrep", "-f", pattern], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        if result.returncode != 0:
            return []
        return [int(pid) for pid in result.stdout.strip().split() if pid.strip().isdigit()]

    if not shutil.which("ps"):
        fail("Neither pgrep nor ps available for process discovery")

    result = subprocess.run(["ps", "-eo", "pid,args"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    lines = result.stdout.splitlines()
    matches = []
    for line in lines[1:]:
        if pattern in line:
            pid_str = line.strip().split(None, 1)[0]
            if pid_str.isdigit():
                matches.append(int(pid_str))
    return matches


def ensure_service_running(name, pattern, start_cmd, cwd=None, log_file=None):
    pids = pgrep(pattern)
    if pids:
        log("SKIP", f"{name} already running (pid(s): {', '.join(map(str, pids))})")
        return pids

    log("START", f"Starting {name}")
    stdout = None
    stderr = None
    if log_file:
        log_path = LOG_DIR / log_file
        stdout = open(log_path, "a", encoding="utf-8")
        stderr = subprocess.STDOUT
    process = subprocess.Popen(start_cmd, cwd=cwd, stdout=stdout, stderr=stderr)
    log("START", f"{name} started (pid: {process.pid})")
    return [process.pid]


def start_redis():
    if pgrep("redis-server"):
        log("SKIP", "Redis already running")
        return

    if shutil.which("systemctl"):
        result = subprocess.run(["systemctl", "is-active", "redis"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        if result.returncode == 0:
            log("SKIP", "Redis service active")
            return

        for service in ["redis", "redis-server"]:
            result = subprocess.run(["systemctl", "start", service])
            if result.returncode == 0:
                log("START", f"Started {service} via systemctl")
                return

    if shutil.which("redis-server"):
        subprocess.run(["redis-server", "--daemonize", "yes"], check=True)
        log("START", "Started redis-server daemon")
        return

    fail("Redis not running and no way to start it")


def django_prep():
    if not (BACKEND_DIR / "manage.py").exists():
        fail("backend/manage.py not found")

    run_cmd([sys.executable, "manage.py", "migrate"], cwd=str(BACKEND_DIR))
    run_cmd([sys.executable, "manage.py", "collectstatic", "--noinput"], cwd=str(BACKEND_DIR))


def ensure_next_build():
    build_id = FRONTEND_DIR / ".next" / "BUILD_ID"
    if build_id.exists():
        log("SKIP", "Next.js build already present")
        return

    run_cmd(["npm", "run", "build"], cwd=str(FRONTEND_DIR))


def reload_nginx():
    if not shutil.which("systemctl"):
        fail("systemctl not found for nginx reload")
    result = subprocess.run(["sudo", "systemctl", "reload", "nginx"])
    if result.returncode != 0:
        fail("Failed to reload nginx")
    log("START", "nginx reloaded")


def check_url(url, name, timeout=5):
    req = Request(url, headers={"User-Agent": "hirenowpro-bootstrap"})
    with urlopen(req, timeout=timeout) as response:
        status = response.getcode()
        body = response.read()
    if status != 200:
        fail(f"{name} health check failed with status {status}")
    log("CHECK", f"{name} OK ({status})")
    return body


def health_checks():
    backend_url = os.getenv("BACKEND_HEALTH_URL", "http://127.0.0.1:8000/api/health/")
    frontend_url = os.getenv("FRONTEND_URL", "http://127.0.0.1:3000/")

    for attempt in range(1, 6):
        try:
            body = check_url(backend_url, "Backend")
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


def main():
    log("BOOT", "HireNowPro bootstrap starting")
    check_python_version()
    require_cmd("node")
    require_cmd("npm")
    require_cmd("gunicorn")
    require_cmd("celery")

    check_env_vars()
    check_postgres()
    check_redis()

    ensure_dirs()
    django_prep()

    start_redis()

    ensure_service_running(
        "Gunicorn",
        "gunicorn core.wsgi:application",
        ["gunicorn", "core.wsgi:application", "--bind", "127.0.0.1:8000", "--workers", "3", "--timeout", "120"],
        cwd=str(BACKEND_DIR),
        log_file="gunicorn.log",
    )

    ensure_service_running(
        "Celery",
        "celery -A core worker",
        ["celery", "-A", "core", "worker", "-l", "info"],
        cwd=str(BACKEND_DIR),
        log_file="celery.log",
    )

    ensure_next_build()

    ensure_service_running(
        "Next.js",
        "next start",
        ["npm", "run", "start"],
        cwd=str(FRONTEND_DIR),
        log_file="next.log",
    )

    reload_nginx()

    health_checks()

    log("DONE", "ALL SERVICES UP")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        fail(f"Command failed with exit code {exc.returncode}")
