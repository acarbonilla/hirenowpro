import logging
import os

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle

logger = logging.getLogger(__name__)


def _client_ip_from_request(request):
    if not request:
        return None
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _public_upload_fallback_rate(scope):
    is_prod = bool(getattr(settings, "IS_PROD", not bool(getattr(settings, "DEBUG", False))))
    env_keys = {
        "public_interview_upload": "PUBLIC_INTERVIEW_UPLOAD_RATE",
        "public_interview_upload_burst": "PUBLIC_INTERVIEW_UPLOAD_BURST_RATE",
        "public_interview_upload_sustained": "PUBLIC_INTERVIEW_UPLOAD_SUSTAINED_RATE",
    }
    defaults = {
        "public_interview_upload": "30/min" if is_prod else "300/min",
        "public_interview_upload_burst": "60/min" if is_prod else "600/min",
        "public_interview_upload_sustained": "600/hour" if is_prod else "6000/hour",
    }
    env_key = env_keys.get(scope)
    env_value = os.getenv(env_key, "").strip() if env_key else ""
    if env_value:
        return env_value
    return defaults.get(scope, "30/min" if is_prod else "300/min")


def _get_public_id(view):
    if not view:
        return None
    kwargs = getattr(view, "kwargs", {}) or {}
    lookup_kwarg = getattr(view, "lookup_url_kwarg", None) or "public_id"
    return kwargs.get(lookup_kwarg) or kwargs.get("public_id")


class ThrottleLoggingMixin:
    def _log_decision(self, request, view, allowed):
        try:
            event = {
                "throttle_class": self.__class__.__name__,
                "throttle_scope": getattr(self, "scope", None),
                "throttle_rate": getattr(self, "rate", None),
                "throttle_decision": "allowed" if allowed else "blocked",
            }
            if request is not None:
                events = getattr(request, "_throttle_events", None)
                if not isinstance(events, list):
                    events = []
                events.append(dict(event))
                setattr(request, "_throttle_events", events)
                event["request_id"] = getattr(request, "_upload_request_id", None)
                event["path"] = getattr(request, "path", None)
                event["method"] = getattr(request, "method", None)
                event["client_ip"] = _client_ip_from_request(request)
            if view is not None:
                event["view"] = view.__class__.__name__
                event["action"] = getattr(view, "action", None)
                event["public_id"] = _get_public_id(view)
            logger.info("throttle_decision", extra=event)
        except Exception:
            logger.exception("Failed to log throttle decision")

    def allow_request(self, request, view):
        self._last_request = request
        self._last_view = view
        allowed = super().allow_request(request, view)
        self._log_decision(request, view, allowed)
        return allowed

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
                    "throttle_class": self.__class__.__name__,
                    "request_id": getattr(request, "_upload_request_id", None) if request else None,
                    "client_ip": _client_ip_from_request(request),
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


class SafePublicUploadScopeMixin:
    """
    Local guardrail for public interview upload throttles.
    Falls back to safe rates if a scope is missing/malformed instead of raising
    ImproperlyConfigured and causing a 500.
    """

    def get_rate(self):
        scope = getattr(self, "scope", None)
        if not scope:
            return super().get_rate()

        rates = (getattr(settings, "REST_FRAMEWORK", {}) or {}).get("DEFAULT_THROTTLE_RATES", {}) or {}
        configured_rate = rates.get(scope)
        fallback_rate = _public_upload_fallback_rate(scope)

        if not configured_rate:
            logger.error(
                "public_upload_scope_missing",
                extra={
                    "throttle_class": self.__class__.__name__,
                    "throttle_scope": scope,
                    "fallback_rate": fallback_rate,
                },
            )
            return fallback_rate

        try:
            return super().get_rate()
        except ImproperlyConfigured:
            logger.exception(
                "public_upload_scope_invalid",
                extra={
                    "throttle_class": self.__class__.__name__,
                    "throttle_scope": scope,
                    "configured_rate": configured_rate,
                    "fallback_rate": fallback_rate,
                },
            )
            return fallback_rate


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


class PublicInterviewUploadThrottle(SafePublicUploadScopeMixin, ThrottleLoggingMixin, AnonRateThrottle):
    scope = "public_interview_upload"


class PublicInterviewSubmitThrottle(ThrottleLoggingMixin, AnonRateThrottle):
    scope = "public_interview_submit"


class PublicInterviewTtsThrottle(ThrottleLoggingMixin, AnonRateThrottle):
    scope = "public_interview_tts"


class PublicInterviewUploadPerInterviewThrottle(SafePublicUploadScopeMixin, ThrottleLoggingMixin, SimpleRateThrottle):
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
