import jwt
import logging
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from applicants.models import Applicant
from datetime import datetime, timedelta
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import normalize_user_type
from .utils import resolve_account_type


APPLICANT_SECRET = settings.APPLICANT_SECRET
APPLICANT_TOKEN_EXPIRY_HOURS = getattr(settings, "APPLICANT_TOKEN_EXPIRY_HOURS", 6)
PHASE2_TOKEN_EXPIRY_HOURS = getattr(settings, "PHASE2_TOKEN_EXPIRY_HOURS", 24)
RETAKE_TOKEN_EXPIRY_HOURS = getattr(settings, "RETAKE_TOKEN_EXPIRY_HOURS", 24)


def validate_hr_access(user):
    if not user or not user.is_authenticated:
        return False

    if getattr(settings, "LOG_HR_AUTH", False):
        logging.getLogger(__name__).debug("HR auth check")
    return resolve_account_type(user) == "HR"


def generate_applicant_token(applicant_id, expiry_hours=None):
    expiry_hours = expiry_hours or APPLICANT_TOKEN_EXPIRY_HOURS
    expires_at = datetime.utcnow() + timedelta(hours=expiry_hours)
    payload = {
        "sub": "applicant",
        "applicant_id": applicant_id,
        "exp": expires_at,
        "expires_at": expires_at.isoformat(),
        "type": "applicant",
        "phase": "phase1",
    }
    return jwt.encode(payload, APPLICANT_SECRET, algorithm="HS256")


def generate_phase2_token(applicant, expiry_hours=None):
    expiry_hours = expiry_hours or PHASE2_TOKEN_EXPIRY_HOURS
    issued_at = datetime.utcnow()
    expires_at = issued_at + timedelta(hours=expiry_hours)
    payload = {
        "sub": "applicant",
        "applicant_id": applicant.id,
        "exp": expires_at,
        "expires_at": expires_at.isoformat(),
        "type": "applicant",
        "phase": "phase2",
        "issued_at": issued_at.isoformat(),
    }
    token = jwt.encode(payload, APPLICANT_SECRET, algorithm="HS256")
    # persist latest phase2 issuance to invalidate older tokens
    applicant.phase2_token_issued_at = issued_at
    applicant.save(update_fields=["phase2_token_issued_at"])
    return token


def generate_retake_token(applicant_id, interview_id, expiry_hours=None, expires_at=None):
    if expires_at is None:
        expiry_hours = expiry_hours or RETAKE_TOKEN_EXPIRY_HOURS
        expires_at = datetime.utcnow() + timedelta(hours=expiry_hours)
    payload = {
        "sub": "applicant",
        "applicant_id": applicant_id,
        "interview_id": interview_id,
        "exp": expires_at,
        "expires_at": expires_at.isoformat(),
        "type": "applicant",
        "phase": "retake",
    }
    return jwt.encode(payload, APPLICANT_SECRET, algorithm="HS256")


class ApplicantTokenAuthentication(BaseAuthentication):
    """
    Simple JWT auth for applicants only, using a dedicated secret.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization") or ""
        if not auth_header.startswith(f"{self.keyword} "):
            return None

        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = jwt.decode(token, APPLICANT_SECRET, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed("Token expired")
        except jwt.InvalidTokenError:
            # slight delay to reduce brute force attempts
            import time
            time.sleep(1)
            raise AuthenticationFailed("Invalid applicant token")

        if payload.get("type") != "applicant":
            raise AuthenticationFailed("Invalid applicant token type")

        applicant_id = payload.get("applicant_id")
        if not applicant_id:
            raise AuthenticationFailed("Invalid applicant token payload")

        try:
            applicant = Applicant.objects.get(id=applicant_id)
        except Applicant.DoesNotExist:
            raise AuthenticationFailed("Applicant not found")

        # Check custom expiry (expires_at claim)
        expires_at_str = payload.get("expires_at")
        if expires_at_str:
            try:
                expires_at = datetime.fromisoformat(expires_at_str)
                if expires_at < datetime.utcnow():
                    # Log expired attempt
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning("Expired applicant token", extra={"remote_addr": request.META.get("REMOTE_ADDR")})
                    raise AuthenticationFailed("Token expired")
            except Exception:
                raise AuthenticationFailed("Token expired")

        # Block phase1 tokens if interview already completed
        phase = payload.get("phase")
        if getattr(applicant, "interview_completed", False) and phase not in {"phase2", "retake"}:
            raise AuthenticationFailed("Interview already completed")

        # For phase2 tokens, ensure matches latest issued_at if recorded
        if phase == "phase2":
            issued_at = payload.get("issued_at")
            if applicant.phase2_token_issued_at and issued_at:
                try:
                    issued_dt = datetime.fromisoformat(issued_at)
                    if issued_dt.replace(tzinfo=None) != applicant.phase2_token_issued_at.replace(tzinfo=None):
                        raise AuthenticationFailed("Token expired")
                except Exception:
                    raise AuthenticationFailed("Token expired")

        if phase == "retake":
            interview_id = payload.get("interview_id")
            if not interview_id:
                raise AuthenticationFailed("Invalid applicant token payload")
            try:
                from interviews.models import Interview

                interview = Interview.objects.filter(
                    id=interview_id,
                    applicant_id=applicant_id,
                    archived=False,
                ).first()
            except Exception:
                interview = None
            if not interview:
                raise AuthenticationFailed("Interview not found")
            if interview.status in {"submitted", "completed", "failed"}:
                raise AuthenticationFailed("Interview already completed")
            if interview.expires_at and interview.expires_at < timezone.now():
                raise AuthenticationFailed("Token expired")

        # Mark as authenticated
        setattr(applicant, "is_authenticated", True)
        setattr(applicant, "user_type", "applicant")
        logging.getLogger(__name__).info("Applicant token auth succeeded")
        return (applicant, None)


class HRTokenAuthentication(JWTAuthentication):
    """
    JWT authentication that only allows HR roles.
    """

    allowed_roles = {"hr_manager", "hr_recruiter", "it_support"}

    def authenticate(self, request):
        res = super().authenticate(request)
        if not res:
            return None
        user, token = res
        user_type = getattr(user, "user_type", None)
        claim_user_type = None
        claim_role = None
        try:
            claim_user_type = token.payload.get("user_type")
            claim_role = token.payload.get("role")
        except Exception:
            pass
        effective_claim = claim_user_type or claim_role
        if effective_claim and user_type and normalize_user_type(user_type) != normalize_user_type(effective_claim):
            logging.getLogger(__name__).warning(
                "User type mismatch in token",
                extra={"user_id": getattr(user, "id", None), "user_type": user_type, "token_user_type": effective_claim},
            )
        return (user, token)
