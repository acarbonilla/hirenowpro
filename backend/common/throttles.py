import logging

from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle

logger = logging.getLogger(__name__)


def _get_public_id(view):
    if not view:
        return None
    kwargs = getattr(view, "kwargs", {}) or {}
    lookup_kwarg = getattr(view, "lookup_url_kwarg", None) or "public_id"
    return kwargs.get(lookup_kwarg) or kwargs.get("public_id")


class ThrottleLoggingMixin:
    def allow_request(self, request, view):
        self._last_request = request
        self._last_view = view
        return super().allow_request(request, view)

    def throttle_failure(self):
        request = getattr(self, "_last_request", None)
        view = getattr(self, "_last_view", None)
        try:
            logger.warning(
                "throttle_limit_exceeded",
                extra={
                    "throttle_scope": getattr(self, "scope", None),
                    "throttle_rate": getattr(self, "rate", None),
                    "throttle_key": getattr(self, "key", None),
                    "client_ip": self.get_ident(request) if request else None,
                    "path": getattr(request, "path", None),
                    "method": getattr(request, "method", None),
                    "user_id": getattr(getattr(request, "user", None), "id", None),
                    "view": view.__class__.__name__ if view else None,
                    "action": getattr(view, "action", None),
                    "public_id": _get_public_id(view),
                },
            )
        except Exception:
            logger.exception("Failed to log throttle limit hit")
        return super().throttle_failure()


class RegistrationHourlyThrottle(SimpleRateThrottle):
    scope = "registration_hourly"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class RegistrationDailyThrottle(SimpleRateThrottle):
    scope = "registration_daily"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class RegistrationBurstThrottle(AnonRateThrottle):
    scope = "registration_burst"

class TrainingUploadMinuteThrottle(UserRateThrottle):
    scope = "training_upload_minute"


class TrainingUploadHourThrottle(UserRateThrottle):
    scope = "training_upload_hour"


class LoginRateThrottle(SimpleRateThrottle):
    scope = "login_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class LoginUserRateThrottle(SimpleRateThrottle):
    scope = "login_user"

    def get_cache_key(self, request, view):
        username = None
        if hasattr(request, "data"):
            username = request.data.get("username") or request.data.get("email")
        if not username:
            return None
        ident = str(username).strip().lower()
        if not ident:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class PublicInterviewRetrieveThrottle(ThrottleLoggingMixin, AnonRateThrottle):
    scope = "public_interview_retrieve"


class PublicInterviewUploadThrottle(ThrottleLoggingMixin, AnonRateThrottle):
    scope = "public_interview_upload"


class PublicInterviewSubmitThrottle(ThrottleLoggingMixin, AnonRateThrottle):
    scope = "public_interview_submit"


class PublicInterviewTtsThrottle(ThrottleLoggingMixin, AnonRateThrottle):
    scope = "public_interview_tts"


class PublicInterviewUploadPerInterviewThrottle(ThrottleLoggingMixin, SimpleRateThrottle):
    scope = None

    def get_cache_key(self, request, view):
        public_id = _get_public_id(view)
        if not public_id:
            return None
        ident = self.get_ident(request)
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"{public_id}:{ident}",
        }


class PublicInterviewUploadBurstThrottle(PublicInterviewUploadPerInterviewThrottle):
    scope = "public_interview_upload_burst"


class PublicInterviewUploadSustainedThrottle(PublicInterviewUploadPerInterviewThrottle):
    scope = "public_interview_upload_sustained"
