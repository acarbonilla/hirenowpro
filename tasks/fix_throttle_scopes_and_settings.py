"""
TASK: Fix Django REST_FRAMEWORK settings so all throttle scopes required by
the application are defined, including login scopes, without breaking dev or prod.

This updates the DEFAULT_THROTTLE_RATES dict in settings.py and ensures
the structure is correct. It also supports environment variables for rate overrides.
"""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path
from textwrap import dedent


def resolve_settings_path() -> Path:
    """Resolve settings.py path for local and deployed environments."""
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


def get_env(key: str, default: str) -> str:
    """Return environment var value, or default if not set."""
    value = os.getenv(key)
    return value.strip() if value else default


def _line_start_offsets(text: str) -> list[int]:
    offsets = [0]
    for match in re.finditer(r"\n", text):
        offsets.append(match.end())
    return offsets


def _offset_from_line_col(line_starts: list[int], line: int, col: int) -> int:
    return line_starts[line - 1] + col


def find_rest_framework_span(text: str) -> tuple[int, int]:
    """Return character offsets [start, end) for the REST_FRAMEWORK assignment."""
    try:
        tree = ast.parse(text)
        line_starts = _line_start_offsets(text)
        for node in tree.body:
            if not isinstance(node, ast.Assign):
                continue
            if any(isinstance(target, ast.Name) and target.id == "REST_FRAMEWORK" for target in node.targets):
                start = _offset_from_line_col(line_starts, node.lineno, node.col_offset)
                end = _offset_from_line_col(line_starts, node.end_lineno, node.end_col_offset)
                return start, end
    except SyntaxError:
        pass

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


def build_throttle_rates_block() -> str:
    """Construct the throttle rates portion of the REST_FRAMEWORK config."""
    return dedent(
        """
        'DEFAULT_THROTTLE_RATES': {
            # Keep anon/user for endpoints that explicitly use AnonRateThrottle/UserRateThrottle.
            'anon': os.getenv('ANON_RATE', '200/min' if DEBUG else '50/min'),
            'user': os.getenv('USER_RATE', '500/min' if DEBUG else '100/min'),

            # Login scopes used by LoginRateThrottle and LoginUserRateThrottle.
            'login_ip': os.getenv('LOGIN_IP_RATE', '200/min' if DEBUG else '10/min'),
            'login_user': os.getenv('LOGIN_USER_RATE', '100/min' if DEBUG else '5/min'),

            # Registration scopes.
            'registration_burst': os.getenv('REGISTRATION_BURST_RATE', '50/min' if DEBUG else '10/min'),
            'registration_hourly': os.getenv('REGISTRATION_HOURLY_RATE', '200/hour' if DEBUG else '5/hour'),
            'registration_daily': os.getenv('REGISTRATION_DAILY_RATE', '500/day' if DEBUG else '10/day'),

            # Public interview scopes.
            'public_interview_retrieve': os.getenv('PUBLIC_INTERVIEW_RETRIEVE_RATE', '1200/min' if DEBUG else '120/min'),
            'public_interview_submit': os.getenv('PUBLIC_INTERVIEW_SUBMIT_RATE', '100/min' if DEBUG else '10/min'),
            'public_interview_tts': os.getenv('PUBLIC_INTERVIEW_TTS_RATE', '200/min' if DEBUG else '20/min'),
            'public_interview_upload': os.getenv('PUBLIC_INTERVIEW_UPLOAD_RATE', '300/min' if DEBUG else '30/min'),
            'public_interview_upload_burst': os.getenv('PUBLIC_INTERVIEW_UPLOAD_BURST_RATE', '600/min' if DEBUG else '60/min'),
            'public_interview_upload_sustained': os.getenv('PUBLIC_INTERVIEW_UPLOAD_SUSTAINED_RATE', '6000/hour' if DEBUG else '600/hour'),

            # Training scopes.
            'training_upload_minute': os.getenv('TRAINING_UPLOAD_MINUTE_RATE', '600/min' if DEBUG else '60/min'),
            'training_upload_hour': os.getenv('TRAINING_UPLOAD_HOUR_RATE', '6000/hour' if DEBUG else '600/hour'),
        },
        """
    ).strip()


def build_rest_framework_block() -> str:
    return dedent(
        f"""
        REST_FRAMEWORK = {{
            'DEFAULT_AUTHENTICATION_CLASSES': [
                'rest_framework_simplejwt.authentication.JWTAuthentication',
            ],
            'DEFAULT_PERMISSION_CLASSES': [
                'rest_framework.permissions.IsAuthenticated',
            ],
            # Scope-only global throttling avoids breaking public auth endpoints.
            'DEFAULT_THROTTLE_CLASSES': [
                'rest_framework.throttling.ScopedRateThrottle',
            ],
            'DEFAULT_EXCEPTION_HANDLER': 'core.exception_handler.json_exception_handler',
            'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
            'PAGE_SIZE': int(os.getenv('REST_PAGE_SIZE', '20')),
            {build_throttle_rates_block()}
        }}
        """
    ).strip() + "\n"


def remove_legacy_debug_override(text: str) -> str:
    """Remove older DEBUG updates that mutate REST_FRAMEWORK throttle rates."""
    pattern = re.compile(
        r"(?ms)^if\s+DEBUG\s*:\s*\n\s*REST_FRAMEWORK\[\"DEFAULT_THROTTLE_RATES\"\]\.update\(\s*\n\s*\{.*?\}\s*\n\s*\)\s*\n?"
    )
    return re.sub(pattern, "", text)


def update_rest_framework_settings(settings_path: Path) -> None:
    """Replace REST_FRAMEWORK config block with a validated, clean version."""
    content = settings_path.read_text(encoding="utf-8")
    start, end = find_rest_framework_span(content)

    clean_block = build_rest_framework_block()
    new_content = content[:start] + clean_block + content[end:]
    new_content = remove_legacy_debug_override(new_content)

    ast.parse(new_content)
    settings_path.write_text(new_content, encoding="utf-8")


def main() -> None:
    settings_path = resolve_settings_path()
    print(f"Updating REST_FRAMEWORK throttle configuration in {settings_path} ...")
    update_rest_framework_settings(settings_path)
    print("Updated REST_FRAMEWORK settings successfully.")
    print("Done. Please restart Gunicorn after this change.")


if __name__ == "__main__":
    main()
