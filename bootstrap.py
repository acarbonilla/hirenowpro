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
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
BOOTSTRAP_MARKER = ROOT / ".bootstrapped"

REQUIRED_ENV = [
    "DJANGO_SECRET_KEY",
    "DEEPGRAM_API_KEY",
    "GEMINI_API_KEY",
    "REDIS_URL",
    "NEXT_PUBLIC_API_BASE_URL",
]

DB_ENV = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"]


def log(step, message):
    print(f"[{step}] {message}")


def fail(message, code=1):
    print(f"[FAIL] {message}")
    sys.exit(code)


ENV_FILE = os.getenv("ENV_FILE")
if ENV_FILE:
    env_path = Path(ENV_FILE).expanduser()
    if not env_path.exists():
        fail(f"ENV_FILE not found: {env_path}")
    load_dotenv(dotenv_path=env_path)
    log("CHECK", f"Loaded env from {env_path}")


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

    if is_celery_enabled() and not os.getenv("CELERY_BROKER_URL"):
        fail("Missing required env var: CELERY_BROKER_URL")

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
    mode, target = parse_redis_target(redis_url)
    if mode == "unix":
        sock = Path(target)
        if not sock.exists():
            fail(f"Redis unix socket not found: {sock}")
        if not sock.is_socket():
            fail(f"Redis unix socket is not a socket: {sock}")
        log("CHECK", f"Redis socket exists: {sock}")
        return
    host, port = target
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
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        fail("REDIS_URL must be set")

    mode, target = parse_redis_target(redis_url)
    if mode == "tcp" and is_external_host(target[0]):
        log("SKIP", "Redis is external; skipping systemd service check")
        return

    for service in get_service_names("SYSTEMD_REDIS_SERVICE", ["redis", "redis-server"]):
        if subprocess.run(["systemctl", "is-active", "--quiet", service]).returncode == 0:
            log("CHECK", f"systemd service active: {service}")
            return

    if is_production_env():
        fail("Required systemd service inactive: redis or redis-server")
    log("WARN", "Redis systemd service inactive; continuing (non-production)")


def check_url(url, name, timeout=5, ok_statuses=None, strict=True):
    ok_statuses = ok_statuses or {200}
    req = Request(url, headers={"User-Agent": "hirenowpro-bootstrap"})
    with urlopen(req, timeout=timeout) as response:
        status = response.getcode()
        body = response.read()
    if status not in ok_statuses:
        message = f"{name} health check failed for {url} with status {status}"
        if strict:
            fail(message)
        raise RuntimeError(message)
    log("CHECK", f"{name} OK ({status})")
    return body


def health_checks():
    backend_path = os.getenv("BACKEND_HEALTH_URL", "/health/")
    frontend_url = os.getenv("FRONTEND_URL")

    if not frontend_url:
        if is_production_env():
            fail("FRONTEND_URL must be set to the production Nginx domain (https)")
        log("WARN", "FRONTEND_URL not set; skipping health checks")
        return False

    parsed_frontend = urlparse(frontend_url)
    if is_production_env():
        if parsed_frontend.scheme != "https":
            fail("FRONTEND_URL must use https")
        if parsed_frontend.hostname in {"localhost", "127.0.0.1"}:
            fail("FRONTEND_URL must not be localhost")
    else:
        if parsed_frontend.scheme not in {"http", "https"}:
            log("WARN", "FRONTEND_URL scheme is not http/https; skipping health checks")
            return False

    if backend_path.startswith("/"):
        backend_url = frontend_url.rstrip("/") + backend_path
    else:
        backend_url = backend_path
    log("CHECK", f"Backend health URL resolved to {backend_url}")

    for attempt in range(1, 6):
        try:
            body = check_url(
                backend_url,
                "Backend",
                ok_statuses={200, 301, 302},
                strict=is_production_env(),
            )
            try:
                payload = json.loads(body.decode("utf-8"))
                if payload.get("status") != "ok":
                    if is_production_env():
                        fail(f"Backend health returned {payload}")
                    log("WARN", f"Backend health returned {payload}")
            except Exception:
                pass
            check_url(frontend_url, "Frontend", strict=is_production_env())
            return True
        except Exception as exc:
            log("WAIT", f"Health check attempt {attempt} failed: {exc}")
            time.sleep(2)

    if is_production_env():
        fail("Health checks failed")
    log("WARN", "Health checks failed; continuing (non-production)")
    return False


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
    env_name = get_env_name()
    if not env_name:
        fail("ENV must be set to production, staging, or dev")
    if env_name not in {"production", "staging", "dev"}:
        fail("ENV must be set to production, staging, or dev")


def is_celery_enabled():
    return os.getenv("ENABLE_CELERY", "0").lower() in {"1", "true", "yes"}


def get_env_name():
    return (os.getenv("ENV") or "").strip().lower()


def is_production_env():
    return get_env_name() == "production"


def get_service_names(env_key, defaults):
    raw = os.getenv(env_key)
    if not raw:
        return defaults
    names = [name.strip() for name in raw.split(",") if name.strip()]
    return names or defaults


def check_gunicorn_bind():
    socket_path = os.getenv("GUNICORN_SOCKET")
    bind = os.getenv("GUNICORN_BIND")
    if socket_path:
        sock = Path(socket_path)
        if not sock.exists():
            fail(f"Gunicorn socket not found: {sock}")
        if not sock.is_socket():
            fail(f"Gunicorn socket is not a socket: {sock}")
        log("CHECK", f"Gunicorn socket exists: {sock}")
        return

    if bind:
        if bind.startswith("unix:"):
            sock = Path(bind.replace("unix:", "", 1))
            if not sock.exists():
                fail(f"Gunicorn socket not found: {sock}")
            if not sock.is_socket():
                fail(f"Gunicorn socket is not a socket: {sock}")
            log("CHECK", f"Gunicorn socket exists: {sock}")
            return
        if ":" in bind:
            host, port_str = bind.rsplit(":", 1)
            try:
                port = int(port_str)
            except ValueError:
                fail(f"Invalid GUNICORN_BIND port: {bind}")
            host = host or "127.0.0.1"
            check_tcp_service(host, port, "Gunicorn")
            return
        fail(f"Invalid GUNICORN_BIND value: {bind}")

    if is_production_env():
        fail("GUNICORN_SOCKET or GUNICORN_BIND must be configured in production")
    log("WARN", "No GUNICORN_SOCKET or GUNICORN_BIND configured; skipping Gunicorn bind check")


def parse_redis_target(redis_url):
    parsed = urlparse(redis_url)
    if parsed.scheme == "unix":
        return "unix", parsed.path
    if parsed.scheme.startswith("unix"):
        return "unix", parsed.path
    host = parsed.hostname or "localhost"
    port = parsed.port or 6379
    return "tcp", (host, port)


def is_external_host(host):
    return host not in {"localhost", "127.0.0.1"}


def main():
    log("VERIFY", "HireNowPro production verification starting")
    guard_production_env()
    if BOOTSTRAP_MARKER.exists() and os.getenv("FORCE_BOOTSTRAP") != "1":
        log("SKIP", "Verification already completed (set FORCE_BOOTSTRAP=1 to re-run)")
        sys.exit(0)

    check_python_version()
    require_cmd("systemctl")
    if is_celery_enabled():
        require_cmd("celery")

    check_env_vars()
    require_redis_service()
    for service in get_service_names("SYSTEMD_GUNICORN_SERVICE", ["gunicorn"]):
        require_systemd_service(service)
    for service in get_service_names("SYSTEMD_NGINX_SERVICE", ["nginx"]):
        require_systemd_service(service)
    if is_celery_enabled():
        for service in get_service_names("SYSTEMD_CELERY_SERVICE", ["celery"]):
            require_systemd_service(service)

    check_redis()
    check_postgres()
    check_gunicorn_bind()
    if is_celery_enabled():
        check_celery_ping()
    health_checks()

    BOOTSTRAP_MARKER.touch()
    log("DONE", "Production verification completed successfully")


if __name__ == "__main__":
    main()
