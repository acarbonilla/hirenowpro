from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, RecruiterProfile


@admin.register(User)
class CustomUserAdmin(UserAdmin):
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
