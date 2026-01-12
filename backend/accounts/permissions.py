from rest_framework.permissions import BasePermission
from common.permissions import IsHRUser as PermissionBasedIsHRUser
from core.roles import normalize_user_type


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
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "APPLICANT")


class IsHRManager(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "HR_MANAGER")


class IsHRRecruiter(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "HR_RECRUITER")


class IsITSupport(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) == "IT_SUPPORT")


class HRPermission(BasePermission):
    """
    Allows HR Manager / HR Recruiter roles.
    """

    allowed = {"HR_MANAGER", "HR_RECRUITER", "ADMIN", "SUPERADMIN"}

    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) in self.allowed)


class RolePermission(BasePermission):
    """
    Generic user_type-based permission. Use as RolePermission(required_user_types=[...])
    or set view.required_user_types = [...].
    Accepts canonical user_type match, or staff/superuser override.
    """

    def __init__(self, required_roles=None, required_user_types=None):
        self.required_roles = required_roles or []
        self.required_user_types = required_user_types or []

    def has_permission(self, request, view):
        required_user_types = self.required_user_types or getattr(view, "required_user_types", []) or []
        if not required_user_types:
            required_user_types = self.required_roles or getattr(view, "required_roles", []) or []
        user = request.user
        if not (user and getattr(user, "is_authenticated", False)):
            return False

        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True

        normalized_user_type = _effective_role(user)
        required_set = {normalize_user_type(r) for r in required_user_types}

        return bool(normalized_user_type and normalized_user_type in required_set)


class PublicOrHRManager(BasePermission):
    """
    Allow public/applicant access, but restrict authenticated HR access to HR staff roles.
    """

    allowed_roles = {"HR_MANAGER", "HR_RECRUITER", "ADMIN", "SUPERADMIN", "APPLICANT"}

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
        if getattr(user, "is_authenticated", False) and _effective_role(user) == "APPLICANT":
            return True
        return bool(_effective_role(user) in ["HR_MANAGER", "HR_RECRUITER", "ADMIN", "SUPERADMIN"] or getattr(user, "is_staff", False))


# Backwards-compat aliases used elsewhere
class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and _effective_role(user) in ["ADMIN", "SUPERADMIN"])


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and getattr(user, "is_authenticated", False) and getattr(user, "is_superuser", False))


class IsHRUser(PermissionBasedIsHRUser):
    """
    HR access via Django permissions (single source of truth).
    """
    pass


class IsHRManagerOnly(BasePermission):
    """
    Allow access only to HR_MANAGER, ADMIN, SUPERADMIN.
    """

    allowed_roles = {"HR_MANAGER", "ADMIN", "SUPERADMIN"}

    def has_permission(self, request, view):
        user = request.user
        if not user or not getattr(user, "is_authenticated", False):
            return False
        if getattr(user, "is_superuser", False):
            return True
        role = normalize_user_type(getattr(user, "user_type", None))
        return role in self.allowed_roles


class IsApplicantUser(IsApplicant):
    """
    Alias for applicant-only permission.
    """

    pass
