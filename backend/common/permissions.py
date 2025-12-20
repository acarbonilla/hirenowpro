from rest_framework.permissions import BasePermission


class IsHRUser(BasePermission):
    """
    HR access based on Django permissions (single source of truth).
    """

    def has_permission(self, request, view):
        user = request.user

        if not user or not getattr(user, "is_authenticated", False):
            return False

        if getattr(user, "is_superuser", False):
            return True

        return (
            user.has_perm("applicants.view_applicant")
            or user.has_perm("interviews.view_interview")
            or user.has_perm("results.view_interviewresult")
        )
