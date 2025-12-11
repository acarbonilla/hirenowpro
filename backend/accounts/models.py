from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom User model extending Django's AbstractUser"""
    
    ROLE_CHOICES = [
        ('applicant', 'Applicant'),
        ('hr', 'HR'),
        ('admin', 'Admin'),
        ('superadmin', 'Super Admin'),
    ]
    
    USER_TYPE_CHOICES = [
        ('recruiter', 'Recruiter'),
        ('hr_admin', 'HR Admin'),
        ('system_admin', 'System Admin'),
    ]
    
    email = models.EmailField(unique=True)
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='recruiter')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='applicant')
    
    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    def __str__(self):
        return f"{self.username} ({self.get_user_type_display()})"

    @property
    def normalized_role(self):
        """Map legacy user_type to role if role not explicitly set"""
        if self.role:
            return self.role
        mapping = {
            'recruiter': 'hr',
            'hr_admin': 'admin',
            'system_admin': 'superadmin',
        }
        return mapping.get(self.user_type, 'applicant')


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
