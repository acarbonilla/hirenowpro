from core.roles import normalize_user_type, is_hr_user_type


def resolve_account_type(user):
    """
    Returns normalized account category: 'HR', 'APPLICANT', or 'UNKNOWN'.
    Uses user_type as source of truth.
    """
    canonical_user_type = normalize_user_type(getattr(user, "user_type", None))
    if canonical_user_type == "APPLICANT":
        return "APPLICANT"
    if is_hr_user_type(canonical_user_type):
        return "HR"
    return "UNKNOWN"
