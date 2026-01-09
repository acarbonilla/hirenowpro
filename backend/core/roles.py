CANONICAL_USER_TYPES = {
    "APPLICANT",
    "HR_MANAGER",
    "HR_RECRUITER",
    "IT_SUPPORT",
    "ADMIN",
    "SUPERADMIN",
}

HR_USER_TYPES = {
    "HR_MANAGER",
    "HR_RECRUITER",
    "IT_SUPPORT",
    "ADMIN",
    "SUPERADMIN",
}

LEGACY_USER_TYPE_MAP = {
    "applicant": "APPLICANT",
    "hr_manager": "HR_MANAGER",
    "hr_recruiter": "HR_RECRUITER",
    "it_support": "IT_SUPPORT",
    "admin": "ADMIN",
    "superadmin": "SUPERADMIN",
    "super_admin": "SUPERADMIN",
    "hr_admin": "ADMIN",
    "system_admin": "ADMIN",
    "recruiter": "HR_RECRUITER",
}


def normalize_user_type(value):
    raw = (value or "").strip()
    if not raw:
        return ""
    key = raw.lower()
    if key in LEGACY_USER_TYPE_MAP:
        return LEGACY_USER_TYPE_MAP[key]
    upper = raw.upper()
    if upper in CANONICAL_USER_TYPES:
        return upper
    return upper


def is_hr_user_type(value):
    return normalize_user_type(value) in HR_USER_TYPES


ROLE_TO_GROUPS = {
    "HR_MANAGER": ["HR Manager"],
    "HR_RECRUITER": ["HR Recruiter"],
    "IT_SUPPORT": ["IT Support"],
    "ADMIN": ["Admin"],
    "SUPERADMIN": ["Super Admin"],
    "APPLICANT": ["Applicant"],
}
