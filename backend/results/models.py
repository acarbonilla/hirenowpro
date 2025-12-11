from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.core.cache import cache
from applicants.models import Applicant
from interviews.models import Interview


class InterviewResult(models.Model):
    """Model for final interview results"""
    
    FINAL_DECISION_CHOICES = [
        ('hired', 'Hired'),
        ('rejected', 'Rejected'),
    ]
    
    interview = models.OneToOneField(Interview, on_delete=models.CASCADE, related_name='result')
    applicant = models.ForeignKey(Applicant, on_delete=models.CASCADE, related_name='results')
    final_score = models.FloatField(help_text="Final aggregated score")
    passed = models.BooleanField(default=False)
    result_date = models.DateTimeField(auto_now_add=True)
    
    # HR Review and Final Decision fields
    final_decision = models.CharField(
        max_length=20, 
        choices=FINAL_DECISION_CHOICES, 
        null=True, 
        blank=True,
        help_text="Final hiring decision made by HR"
    )
    final_decision_date = models.DateTimeField(
        null=True, 
        blank=True,
        help_text="When HR made the final decision"
    )
    final_decision_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='final_decisions',
        help_text="HR person who made the final decision"
    )
    final_decision_notes = models.TextField(
        blank=True,
        help_text="HR notes about the final decision"
    )
    
    # Tracking for display and notifications
    hr_portal_displayed = models.BooleanField(default=False, help_text="Whether result is displayed in HR portal")
    email_notification_sent = models.BooleanField(default=False, help_text="Whether email notification was sent")
    
    class Meta:
        db_table = 'interview_results'
        verbose_name = 'Interview Result'
        verbose_name_plural = 'Interview Results'
        ordering = ['-result_date']
        indexes = [
            models.Index(fields=['result_date'], name='idx_result_date'),
            models.Index(fields=['final_score'], name='idx_result_final_score'),
            models.Index(fields=['passed'], name='idx_result_passed'),
            models.Index(fields=['final_decision'], name='idx_result_final_decision'),
            models.Index(fields=['applicant'], name='idx_result_applicant'),
            models.Index(fields=['interview'], name='idx_result_interview'),
        ]
    
    def __str__(self):
        status = "PASSED" if self.passed else "FAILED"
        return f"{self.applicant.full_name} - {status} (Score: {self.final_score})"


class ReapplicationTracking(models.Model):
    """Model for tracking applicant reapplication eligibility"""
    
    applicant = models.OneToOneField(Applicant, on_delete=models.CASCADE, related_name='reapplication_tracking')
    last_application_date = models.DateField()
    can_reapply_after = models.DateField(help_text="Date when applicant can reapply (2-3 weeks from last application)")
    reapplication_count = models.IntegerField(default=0, help_text="Number of times applicant has reapplied")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'reapplication_tracking'
        verbose_name = 'Reapplication Tracking'
        verbose_name_plural = 'Reapplication Tracking'
        ordering = ['-last_application_date']
    
    def __str__(self):
        return f"{self.applicant.full_name} - Can reapply after {self.can_reapply_after}"
    
    @property
    def is_eligible_to_reapply(self):
        """Check if applicant is eligible to reapply"""
        from datetime import date
        return date.today() >= self.can_reapply_after


class SystemSettings(models.Model):
    """
    Global system settings that can be modified by HR/Admin
    Only one instance should exist (singleton pattern)
    """
    
    # Scoring thresholds
    passing_score_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=70.0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Minimum score required to pass (0-100). Scores at or above this are 'hire' recommendations."
    )

    @staticmethod
    def get_passing_threshold():
        settings = SystemSettings.objects.first()
        if settings:
            return float(settings.passing_score_threshold)
        return 70.0   # default fallback
    
    review_score_threshold = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=50.0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="Minimum score for review queue (0-100). Scores between this and passing threshold need HR review."
    )
    
    # Application settings
    max_concurrent_interviews = models.IntegerField(
        default=100,
        validators=[MinValueValidator(1)],
        help_text="Maximum number of active interviews allowed at once"
    )
    
    interview_expiry_days = models.IntegerField(
        default=7,
        validators=[MinValueValidator(1)],
        help_text="Number of days before an incomplete interview expires"
    )
    
    # AI settings
    enable_script_detection = models.BooleanField(
        default=True,
        help_text="Enable AI-based script reading detection"
    )
    
    enable_sentiment_analysis = models.BooleanField(
        default=True,
        help_text="Enable sentiment analysis in interviews"
    )
    
    # Metadata
    last_modified = models.DateTimeField(auto_now=True)
    modified_by = models.CharField(max_length=100, blank=True)
    
    class Meta:
        db_table = 'system_settings'
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"
    
    def __str__(self):
        return f"System Settings (Passing: {self.passing_score_threshold}%, Review: {self.review_score_threshold}%)"
    
    def save(self, *args, **kwargs):
        # Ensure only one instance exists (singleton)
        if not self.pk and SystemSettings.objects.exists():
            # Update existing instance instead of creating new one
            existing = SystemSettings.objects.first()
            self.pk = existing.pk
        
        # Clear cache when settings change (gracefully handle cache failures)
        try:
            cache.delete('system_settings')
        except Exception:
            pass  # Cache failure is not critical
        
        super().save(*args, **kwargs)
    
    @classmethod
    def get_settings(cls):
        """Get system settings (cached)"""
        try:
            settings = cache.get('system_settings')
            if settings is None:
                settings, _ = cls.objects.get_or_create(pk=1)
                try:
                    cache.set('system_settings', settings, timeout=3600)  # Cache for 1 hour
                except Exception:
                    pass  # Cache failure is not critical
            return settings
        except Exception:
            # If cache fails, just get from database
            settings, _ = cls.objects.get_or_create(pk=1)
            return settings
    
    @classmethod
    def get_passing_threshold(cls):
        """Get current passing score threshold"""
        return float(cls.get_settings().passing_score_threshold)
    
    @classmethod
    def get_review_threshold(cls):
        """Get current review score threshold"""
        return float(cls.get_settings().review_score_threshold)
