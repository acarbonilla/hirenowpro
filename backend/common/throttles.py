from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


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
