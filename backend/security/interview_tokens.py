from django.conf import settings
from django.core import signing

TOKEN_SALT = "interview-access"
DEFAULT_EXPIRY_HOURS = int(getattr(settings, "INTERVIEW_TOKEN_EXPIRY_HOURS", 48))


def _signer() -> signing.TimestampSigner:
    return signing.TimestampSigner(salt=TOKEN_SALT)


def generate_interview_token(public_id, expires_in_hours: int | None = None) -> str:
    """
    Generate a short-lived, interview-scoped access token.
    """
    _ = expires_in_hours  # expiry enforced during verification
    return _signer().sign(str(public_id))


def verify_interview_token(token: str, public_id, expires_in_hours: int | None = None) -> bool:
    """
    Verify token validity and ensure it matches the interview public_id.
    """
    if not token:
        return False
    max_age = (expires_in_hours or DEFAULT_EXPIRY_HOURS) * 60 * 60
    try:
        value = _signer().unsign(token, max_age=max_age)
    except signing.BadSignature:
        return False
    return value == str(public_id)


def extract_bearer_token(auth_header: str | None) -> str | None:
    if not auth_header:
        return None
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None
