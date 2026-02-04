from rest_framework.permissions import BasePermission

from security.interview_tokens import extract_bearer_token, verify_interview_token


class InterviewTokenPermission(BasePermission):
    message = "Valid interview token required."

    def has_permission(self, request, view):
        public_id = self._get_public_id(request, view)
        if not public_id:
            return False
        token = extract_bearer_token(request.headers.get("Authorization"))
        if not token:
            return False
        return verify_interview_token(token, public_id)

    @staticmethod
    def _get_public_id(request, view):
        lookup_kwarg = getattr(view, "lookup_url_kwarg", None) or getattr(view, "lookup_field", None)
        if lookup_kwarg and hasattr(view, "kwargs"):
            public_id = view.kwargs.get(lookup_kwarg)
            if public_id:
                return public_id
        if hasattr(request, "data"):
            public_id = request.data.get("public_id")
            if public_id:
                return public_id
        return request.query_params.get("public_id")
