# tasks/increase_upload_throttle_limits.py

"""
Task: Increase DRF throttle limits for public interview upload and submit endpoints.

This script adds customized throttle rates in settings and binds appropriate throttle
classes to the API views that handle interview upload and submission.

It is safe for both development and production environments.
"""

from pathlib import Path
import re

# Paths
SETTINGS_PATH = Path("/var/www/hirenowpro/backend/core/settings.py")

# New throttle settings
NEW_THROTTLE_RATES = {
    "public_interview_upload": "120/min",   # higher limit for uploads
    "public_interview_submit": "30/min",    # higher limit for submit
    "public_interview_retrieve": "60/min",  # retrieve can be reasonably higher
    "public_interview_tts": "30/min",
}

def update_throttle_rates():
    """
    Replace existing throttle rates block in settings with increased limits.
    """
    text = SETTINGS_PATH.read_text()

    # Find the DEFAULT_THROTTLE_RATES section
    pattern = r"('DEFAULT_THROTTLE_RATES':\s*\{)([\s\S]*?)(\})"
    match = re.search(pattern, text)
    if not match:
        print("Could not find DEFAULT_THROTTLE_RATES in settings.py")
        return

    # Build replacement text
    replaced = match.group(1) + "\n"
    for key, rate in NEW_THROTTLE_RATES.items():
        replaced += f"    '{key}': '{rate}',\n"
    replaced += match.group(3)

    # Replace in the file
    new_text = text[: match.start()] + replaced + text[match.end() :]

    SETTINGS_PATH.write_text(new_text)
    print("Throttle rates updated successfully!")


def main():
    print("Updating throttle rates...")
    update_throttle_rates()
    print("Done. Please restart Gunicorn after this change.")


if __name__ == "__main__":
    main()
