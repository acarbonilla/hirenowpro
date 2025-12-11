from django.contrib import admin
from .models import InterviewResult, ReapplicationTracking, SystemSettings


@admin.register(InterviewResult)
class InterviewResultAdmin(admin.ModelAdmin):
    list_display = ['applicant', 'interview', 'final_score', 'passed', 'result_date', 
                    'hr_portal_displayed', 'email_notification_sent']
    list_filter = ['passed', 'hr_portal_displayed', 'email_notification_sent', 'result_date']
    search_fields = ['applicant__first_name', 'applicant__last_name', 'applicant__email']
    readonly_fields = ['result_date']


@admin.register(ReapplicationTracking)
class ReapplicationTrackingAdmin(admin.ModelAdmin):
    list_display = ['applicant', 'last_application_date', 'can_reapply_after', 
                    'reapplication_count', 'is_eligible_to_reapply']
    list_filter = ['last_application_date', 'can_reapply_after']
    search_fields = ['applicant__first_name', 'applicant__last_name', 'applicant__email']
    readonly_fields = ['created_at', 'updated_at']
    
    def is_eligible_to_reapply(self, obj):
        return obj.is_eligible_to_reapply
    is_eligible_to_reapply.boolean = True
    is_eligible_to_reapply.short_description = 'Eligible to Reapply'


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    fieldsets = [
        ('Scoring Thresholds', {
            'fields': ['passing_score_threshold', 'review_score_threshold'],
            'description': 'Configure score thresholds for automatic recommendations'
        }),
        ('Application Settings', {
            'fields': ['max_concurrent_interviews', 'interview_expiry_days'],
        }),
        ('AI Features', {
            'fields': ['enable_script_detection', 'enable_sentiment_analysis'],
        }),
        ('Metadata', {
            'fields': ['last_modified', 'modified_by'],
            'classes': ['collapse'],
        }),
    ]
    readonly_fields = ['last_modified']
    
    def has_add_permission(self, request):
        # Only allow one instance
        return not SystemSettings.objects.exists()
    
    def has_delete_permission(self, request, obj=None):
        # Don't allow deleting settings
        return False
    
    def save_model(self, request, obj, form, change):
        obj.modified_by = request.user.get_full_name() or request.user.username
        super().save_model(request, obj, form, change)
