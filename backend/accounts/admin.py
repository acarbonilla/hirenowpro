from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, RecruiterProfile


class UserAdminForm(forms.ModelForm):
    class Meta:
        model = User
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        allowed_admin_user_types = [
            ("hr_admin", "HR Admin"),
            ("hr_manager", "HR Manager"),
            ("recruiter", "Recruiter"),
            ("it_support", "IT Support"),
            ("admin", "Admin"),
            ("superadmin", "Super Admin"),
            ("applicant", "Applicant"),
        ]

        if "user_type" in self.fields:
            self.fields["user_type"].choices = allowed_admin_user_types


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    form = UserAdminForm
    list_display = ['username', 'email', 'user_type', 'is_active', 'date_joined']
    list_filter = ['user_type', 'is_active', 'is_staff']
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Fields', {'fields': ('user_type',)}),
    )


@admin.register(RecruiterProfile)
class RecruiterProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'employee_id', 'department', 'portal_access_level', 'created_at']
    search_fields = ['user__username', 'employee_id', 'department']
    list_filter = ['portal_access_level', 'created_at']
