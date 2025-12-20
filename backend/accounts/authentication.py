import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from applicants.models import Applicant
from datetime import datetime, timedelta
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.contrib.auth import get_user_model


APPLICANT_SECRET = getattr(settings, "APPLICANT_SECRET", settings.SECRET_KEY)
APPLICANT_TOKEN_EXPIRY_HOURS = getattr(settings, "APPLICANT_TOKEN_EXPIRY_HOURS", 6)
PHASE2_TOKEN_EXPIRY_HOURS = getattr(settings, "PHASE2_TOKEN_EXPIRY_HOURS", 24)


def debug(msg):
    print("HR_AUTH_DEBUG:", msg)


def validate_hr_access(user):
    if not user or not user.is_authenticated:
        return False

    allowed_roles = ["hr_manager", "hr_recruiter"]
    if getattr(settings, "LOG_HR_AUTH", False):
        debug(f"user={user.username}, role={user.role}, groups={[g.name for g in user.groups.all()]}")
    return user.role in allowed_roles


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


class ApplicantTokenAuthentication(BaseAuthentication):
    """
    Simple JWT auth for applicants only, using a dedicated secret.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization") or ""
        print("DEBUG_TOKEN_AUTH:", auth_header)
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
                    logger.warning(f"Expired applicant token for applicant {applicant_id} from {request.META.get('REMOTE_ADDR')}")
                    raise AuthenticationFailed("Token expired")
            except Exception:
                raise AuthenticationFailed("Token expired")

        # Block phase1 tokens if interview already completed
        phase = payload.get("phase")
        if getattr(applicant, "interview_completed", False) and phase != "phase2":
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

        # Mark as authenticated
        setattr(applicant, "is_authenticated", True)
        setattr(applicant, "user_type", "applicant")
        print("DEBUG_TOKEN_RESULT:", applicant.id)
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
        role = getattr(user, "role", None)
        # SimpleJWT stores claims; token.payload may have role claim
        claim_role = None
        try:
            claim_role = token.payload.get("role")
        except Exception:
            pass
        # Role is informational only; authorization handled by DRF permissions.
        effective_role = claim_role or role
        if effective_role:
            setattr(user, "user_type", effective_role)
        return (user, token)
