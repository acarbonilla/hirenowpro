from django.contrib.auth.models import AbstractUser
from django.db import models

ROLE_GROUP_MAP = {
    "hr_manager": "HR Manager",
    "hr_recruiter": "HR Recruiter",
    "it_support": "IT Support",
    "applicant": "Applicant",
}


def normalize_user_type(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip().lower()
    return str(value).strip().lower()


class User(AbstractUser):
    """Custom User model extending Django's AbstractUser"""
    
    ROLE_CHOICES = [
        ("recruiter", "Recruiter"),
        ("hr_admin", "HR Admin"),
        ("system_admin", "System Admin"),
        ("hr_recruiter", "HR Recruiter"),
        ("hr_manager", "HR Manager"),
        ("it_support", "IT Support"),
        ("admin", "Admin"),
        ("superadmin", "Super Admin"),
        ("applicant", "Applicant"),
    ]

    USER_TYPE_CHOICES = [
        ("recruiter", "Recruiter"),
        ("hr_admin", "HR Admin"),
        ("system_admin", "System Admin"),
        ("hr_recruiter", "HR Recruiter"),
        ("hr_manager", "HR Manager"),
        ("it_support", "IT Support"),
        ("admin", "Admin"),
        ("superadmin", "Super Admin"),
        ("applicant", "Applicant"),
    ]
    
    email = models.EmailField(unique=True)
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default="recruiter")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="applicant")
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    def __str__(self):
        return f"{self.username} ({self.get_user_type_display()})"

    @property
    def normalized_role(self):
        """Derived role for legacy compatibility (user_type is authoritative)."""
        normalized = normalize_user_type(self.user_type)
        return normalized or "applicant"

    def sync_role_group(self):
        """Ensures user.role always matches the correct Django group."""
        from django.contrib.auth.models import Group
        group_name = ROLE_GROUP_MAP.get(self.role)

        if not group_name:
            return

        group, _ = Group.objects.get_or_create(name=group_name)
        self.groups.clear()
        self.groups.add(group)

    def save(self, *args, **kwargs):
        self.role = self.normalized_role
        super().save(*args, **kwargs)
        self.sync_role_group()


class RecruiterProfile(models.Model):
    """Extended profile for recruiter users"""
    
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='recruiter_profile')
    department = models.CharField(max_length=100, blank=True)
    employee_id = models.CharField(max_length=50, unique=True)
    portal_access_level = models.IntegerField(default=1, help_text="Access level for portal features")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'recruiter_profiles'
        verbose_name = 'Recruiter Profile'
        verbose_name_plural = 'Recruiter Profiles'
    
    def __str__(self):
        return f"Profile: {self.user.username} - {self.employee_id}"
