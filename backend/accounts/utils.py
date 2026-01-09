def resolve_account_type(user):
    """
    Returns normalized account category: 'HR', 'APPLICANT', or 'UNKNOWN'.
    Does NOT rely on raw user_type strings directly.
    """
    role = (getattr(user, "role", "") or "").upper()
    user_type = (getattr(user, "user_type", "") or "").upper()

    hr_roles = {
        "HR_ADMIN",
        "HR_MANAGER",
        "HR_RECRUITER",
        "RECRUITER",
        "ADMIN",
        "SUPER_ADMIN",
        "SUPERADMIN",
        "SYSTEM_ADMIN",
    }

    if getattr(user, "is_staff", False) and (role in hr_roles or user_type in hr_roles):
        return "HR"

    if role == "APPLICANT" or user_type == "APPLICANT":
        return "APPLICANT"

    return "UNKNOWN"
