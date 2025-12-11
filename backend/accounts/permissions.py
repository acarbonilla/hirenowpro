from rest_framework.permissions import BasePermission


class IsApplicant(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "normalized_role", getattr(user, "role", None)) == "applicant")


class IsHR(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        role = getattr(user, "normalized_role", getattr(user, "role", None))
        return bool(
            user
            and user.is_authenticated
            and (
                role in ["hr", "admin", "superadmin"]
                or getattr(user, "is_staff", False)
            )
        )


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        role = getattr(user, "normalized_role", getattr(user, "role", None))
        return bool(
            user
            and user.is_authenticated
            and (
                role in ["admin", "superadmin"]
                or getattr(user, "is_staff", False)
            )
        )


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "is_superuser", False))


class RolePermission(BasePermission):
    """
    Generic role-based permission. Use as RolePermission(required_roles=[...]).
    Accepts role match (case-insensitive), or staff/superuser override.
    """

    def __init__(self, required_roles=None):
        self.required_roles = required_roles or []

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        # Superuser/staff shortcut
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
            return True

        normalized_role = getattr(user, "normalized_role", getattr(user, "role", None))
        normalized_role_upper = normalized_role.upper() if normalized_role else None

        required_upper = [r.upper() for r in self.required_roles]

        if normalized_role_upper and normalized_role_upper in required_upper:
            return True

        # Fallback: check group names if present
        try:
            groups = [g.upper().replace(" ", "_") for g in user.groups.values_list("name", flat=True)]
            return any(g in required_upper for g in groups)
        except Exception:
            return False
