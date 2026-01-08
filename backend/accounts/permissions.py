from rest_framework.permissions import BasePermission
from common.permissions import IsHRUser as PermissionBasedIsHRUser
from .models import normalize_user_type


def _user_type(user):
    return getattr(user, "user_type", None)


def _effective_role(user):
    return normalize_user_type(_user_type(user))


class IsApplicant(BasePermission):
    """
    Strictly applicant-facing permission.
    """

    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "applicant")


class IsHRManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "hr_manager")


class IsHRRecruiter(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "hr_recruiter")


class IsITSupport(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "it_support")


class HRPermission(BasePermission):
    """
    Allows HR Manager / HR Recruiter / IT Support roles.
    """

    allowed = {"hr_manager", "hr_recruiter", "it_support"}

    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) in self.allowed)


class RolePermission(BasePermission):
    """
    Generic role-based permission. Use as RolePermission(required_roles=[...])
    or set view.required_roles = [...].
    Accepts role match (case-insensitive), or staff/superuser override.
    """

    def __init__(self, required_roles=None):
        self.required_roles = required_roles or []

    def has_permission(self, request, view):
        required_roles = self.required_roles or getattr(view, "required_roles", []) or []
        user = request.user
        if not (user and getattr(user, "is_authenticated", False)):
            return False

        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True

        normalized_role = _effective_role(user)
        normalized_role_upper = normalized_role.upper() if normalized_role else None
        required_upper = [r.upper() for r in required_roles]

        if normalized_role_upper and normalized_role_upper in required_upper:
            return True

        try:
            groups = [g.upper().replace(" ", "_") for g in user.groups.values_list("name", flat=True)]
            return any(g in required_upper for g in groups)
        except Exception:
            return False


class PublicOrHRManager(BasePermission):
    """
    Allow public/applicant access, but restrict authenticated HR access to HR staff roles.
    """

    allowed_roles = {"hr_manager", "hr_recruiter", "admin", "superadmin", "applicant"}

    def has_permission(self, request, view):
        user = request.user
        if not user or not getattr(user, "is_authenticated", False):
            return True
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True
        return _effective_role(user) in self.allowed_roles


class ApplicantOrHR(BasePermission):
    """
    Allow either applicant token or HR/admin user.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user:
            return False
        if getattr(user, "is_authenticated", False) and _effective_role(user) == "applicant":
            return True
        return bool(_effective_role(user) in ["hr_manager", "hr_recruiter", "it_support", "admin", "superadmin"] or getattr(user, "is_staff", False))


# Backwards-compat aliases used elsewhere
class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) in ["admin", "superadmin"])


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "is_superuser", False))


class IsHRUser(PermissionBasedIsHRUser):
    """
    HR access via Django permissions (single source of truth).
    """
    pass


class IsApplicantUser(IsApplicant):
    """
    Alias for applicant-only permission.
    """

    pass
