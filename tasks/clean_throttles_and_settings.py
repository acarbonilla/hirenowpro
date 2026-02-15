"""
TASK: Clean and fix REST_FRAMEWORK settings safely (dev + production)

This ensures:
- REST_FRAMEWORK settings are valid Python
- Throttle rates are driven by environment variables with sane defaults
- Auth endpoints are not broken by global throttling
- Scopes exist for each throttled endpoint
- Dev environment is very permissive for ease of testing
"""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path
from textwrap import dedent


def resolve_settings_path() -> Path:
    """
    Resolve the Django settings path in local and deployed environments.
    """
    env_path = os.getenv("SETTINGS_PATH")
    if env_path:
        candidate = Path(env_path).expanduser()
        if candidate.exists():
            return candidate

    candidates = [
        Path("/var/www/hirenowpro/backend/core/settings.py"),
        Path(__file__).resolve().parents[1] / "backend" / "core" / "settings.py",
        Path.cwd() / "backend" / "core" / "settings.py",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError("Could not locate backend/core/settings.py. Set SETTINGS_PATH and retry.")


def _line_start_offsets(text: str) -> list[int]:
    offsets = [0]
    for match in re.finditer(r"\n", text):
        offsets.append(match.end())
    return offsets


def _offset_from_line_col(line_starts: list[int], line: int, col: int) -> int:
    return line_starts[line - 1] + col


def find_rest_framework_span(text: str) -> tuple[int, int]:
    """
    Return [start, end) character offsets for the REST_FRAMEWORK assignment.

    Uses AST when possible; falls back to brace scanning when parsing fails.
    """
    try:
        tree = ast.parse(text)
        line_starts = _line_start_offsets(text)
        for node in tree.body:
            if isinstance(node, ast.Assign):
                if any(isinstance(target, ast.Name) and target.id == "REST_FRAMEWORK" for target in node.targets):
                    start = _offset_from_line_col(line_starts, node.lineno, node.col_offset)
                    end = _offset_from_line_col(line_starts, node.end_lineno, node.end_col_offset)
                    return start, end
    except SyntaxError:
        pass

    # Fallback for malformed Python where AST parsing fails.
    match = re.search(r"(?m)^REST_FRAMEWORK\s*=", text)
    if not match:
        raise ValueError("Could not locate REST_FRAMEWORK assignment.")

    start = match.start()
    brace_start = text.find("{", match.end())
    if brace_start == -1:
        raise ValueError("Found REST_FRAMEWORK assignment but no opening '{'.")

    depth = 0
    in_single = False
    in_double = False
    escaped = False

    for idx in range(brace_start, len(text)):
        char = text[idx]

        if escaped:
            escaped = False
            continue

        if char == "\\":
            escaped = True
            continue

        if in_single:
            if char == "'":
                in_single = False
            continue

        if in_double:
            if char == '"':
                in_double = False
            continue

        if char == "'":
            in_single = True
            continue

        if char == '"':
            in_double = True
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return start, idx + 1

    raise ValueError("Could not find matching closing '}' for REST_FRAMEWORK.")


def build_rest_framework_block() -> str:
    """
    Canonical REST_FRAMEWORK block with env-driven rates and safe defaults.
    """
    return dedent(
        """
        REST_FRAMEWORK = {
            'DEFAULT_AUTHENTICATION_CLASSES': [
                'rest_framework_simplejwt.authentication.JWTAuthentication',
            ],
            'DEFAULT_PERMISSION_CLASSES': [
                'rest_framework.permissions.IsAuthenticated',
            ],
            # Scope-only global throttling avoids breaking auth endpoints with AllowAny.
            'DEFAULT_THROTTLE_CLASSES': [
                'rest_framework.throttling.ScopedRateThrottle',
            ],
            'DEFAULT_EXCEPTION_HANDLER': 'core.exception_handler.json_exception_handler',
            'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
            'PAGE_SIZE': int(os.getenv('REST_PAGE_SIZE', '20')),
            'DEFAULT_THROTTLE_RATES': {
                'anon': os.getenv('ANON_RATE', '200/min' if DEBUG else '50/min'),
                'user': os.getenv('USER_RATE', '500/min' if DEBUG else '100/min'),

                'login_ip': os.getenv('LOGIN_IP_RATE', '200/min' if DEBUG else '10/min'),
                'login_user': os.getenv('LOGIN_USER_RATE', '100/min' if DEBUG else '5/min'),

                'registration_burst': os.getenv('REGISTRATION_BURST_RATE', '50/min' if DEBUG else '10/min'),
                'registration_hourly': os.getenv('REGISTRATION_HOURLY_RATE', '200/hour' if DEBUG else '5/hour'),
                'registration_daily': os.getenv('REGISTRATION_DAILY_RATE', '500/day' if DEBUG else '10/day'),

                'public_interview_upload': os.getenv('PUBLIC_INTERVIEW_UPLOAD_RATE', '300/min' if DEBUG else '30/min'),
                'public_interview_submit': os.getenv('PUBLIC_INTERVIEW_SUBMIT_RATE', '100/min' if DEBUG else '10/min'),
                'public_interview_retrieve': os.getenv('PUBLIC_INTERVIEW_RETRIEVE_RATE', '1200/min' if DEBUG else '120/min'),
                'public_interview_tts': os.getenv('PUBLIC_INTERVIEW_TTS_RATE', '200/min' if DEBUG else '20/min'),
                'public_interview_upload_burst': os.getenv('PUBLIC_INTERVIEW_UPLOAD_BURST_RATE', '600/min' if DEBUG else '60/min'),
                'public_interview_upload_sustained': os.getenv('PUBLIC_INTERVIEW_UPLOAD_SUSTAINED_RATE', '6000/hour' if DEBUG else '600/hour'),

                'training_upload_minute': os.getenv('TRAINING_UPLOAD_MINUTE_RATE', '600/min' if DEBUG else '60/min'),
                'training_upload_hour': os.getenv('TRAINING_UPLOAD_HOUR_RATE', '6000/hour' if DEBUG else '600/hour'),
            },
        }
        """
    ).strip() + "\n"


def remove_legacy_debug_override(text: str) -> str:
    """
    Remove older DEBUG override block that mutates REST_FRAMEWORK throttle rates.

    Rates are now env-driven directly in the REST_FRAMEWORK dictionary.
    """
    pattern = re.compile(
        r"(?ms)^if\s+DEBUG\s*:\s*\n\s*REST_FRAMEWORK\[\"DEFAULT_THROTTLE_RATES\"\]\.update\(\s*\n\s*\{.*?\}\s*\n\s*\)\s*\n?"
    )
    return re.sub(pattern, "", text)


def update_settings_file(settings_path: Path) -> None:
    """
    Replace REST_FRAMEWORK assignment with a validated, clean block.
    """
    original = settings_path.read_text(encoding="utf-8")
    start, end = find_rest_framework_span(original)

    clean_block = build_rest_framework_block()
    updated = original[:start] + clean_block + original[end:]
    updated = remove_legacy_debug_override(updated)

    # Validate Python syntax before writing.
    ast.parse(updated)

    settings_path.write_text(updated, encoding="utf-8")


def main() -> None:
    settings_path = resolve_settings_path()
    print(f"Updating REST_FRAMEWORK in {settings_path} ...")
    update_settings_file(settings_path)
    print("REST_FRAMEWORK settings updated successfully.")
    print("Restart Gunicorn (or your Django app process) for changes to take effect.")


if __name__ == "__main__":
    main()
