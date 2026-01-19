from django.db import models
from django.conf import settings
from applicants.models import Applicant, OfficeLocation
from .type_models import PositionType, QuestionType
from django.utils.functional import cached_property
from django.utils import timezone
from django.core.exceptions import ValidationError
from .question_alignment import get_alignment_error

# Controlled competency list for initial interview screening
COMPETENCY_CHOICES = [
    ("communication", "Communication"),
    ("customer_handling", "Customer Handling"),
    ("problem_explanation", "Problem Explanation"),
    ("troubleshooting", "Troubleshooting"),
    ("technical_reasoning", "Technical Reasoning"),
    ("networking_concepts", "Networking Concepts"),
    ("sales_upselling", "Sales / Upselling"),
]


class InterviewQuestion(models.Model):
    """Model for interview questions"""
    
    question_text = models.TextField()
    question_type = models.ForeignKey(
        QuestionType,
        on_delete=models.PROTECT,
        related_name='questions',
        help_text="Type of question"
    )
    category = models.ForeignKey(
        PositionType,
        on_delete=models.PROTECT,
        related_name='category_questions',
        help_text="Job category this question belongs to",
        null=True,
        blank=True,
    )
    position_type = models.ForeignKey(
        PositionType,
        on_delete=models.PROTECT,
        related_name='questions',
        help_text="Job position this question is designed for"
    )
    competency = models.CharField(
        max_length=50,
        choices=COMPETENCY_CHOICES,
        default="communication",
        help_text="Competency bucket used for initial interview routing",
    )
    tags = models.JSONField(default=list, blank=True, help_text="(Deprecated) legacy subrole tags; use competency instead.")
    max_duration = models.DurationField(null=True, blank=True, help_text="Maximum duration for answer")
    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0, help_text="Display order of the question")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'interview_questions'
        verbose_name = 'Interview Question'
        verbose_name_plural = 'Interview Questions'
        ordering = ['order', 'id']
    
    def __str__(self):
        question_type_name = self.question_type.name if self.question_type else "General"
        return f"{question_type_name}: {self.question_text[:50]}"

    def clean(self):
        super().clean()
        assigned_code = getattr(self.position_type, "code", None)
        error = get_alignment_error(self.question_text, assigned_code)
        if error:
            raise ValidationError({"position_type": error})


class Interview(models.Model):
    """Model for AI interviews"""
    
    INTERVIEW_TYPE_CHOICES = [
        ('initial_ai', 'Initial AI Interview'),
        ('technical', 'Technical Interview'),
        ('final', 'Final Interview'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('submitted', 'Submitted'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    PROCESSING_STATUS_CHOICES = [
        ("IDLE", "Idle"),
        ("QUEUED", "Queued"),
        ("RUNNING", "Running"),
        ("SUCCEEDED", "Succeeded"),
        ("FAILED", "Failed"),
    ]
    HR_DECISION_CHOICES = [
        ('hire', 'Hire'),
        ('reject', 'Reject'),
        ('hold', 'Hold'),
    ]
    FINAL_DECISION_CHOICES = [
        ('pass', 'Pass'),
        ('review', 'Review'),
        ('fail', 'Fail'),
    ]
    
    applicant = models.ForeignKey(Applicant, on_delete=models.CASCADE, related_name='interviews')
    interview_type = models.CharField(max_length=20, choices=INTERVIEW_TYPE_CHOICES, default='initial_ai')
    position_type = models.ForeignKey(
        PositionType,
        on_delete=models.PROTECT,
        related_name='interviews',
        help_text="Position type selected for this interview",
        null=True,
        blank=True
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    current_question_index = models.PositiveIntegerField(
        default=0,
        help_text="0-based index for next question when resuming an in-progress interview",
    )
    attempt_number = models.PositiveIntegerField(
        default=1,
        help_text="Interview attempt number for the applicant",
    )
    resumed_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of times HR resent the interview link",
    )
    last_activity_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last applicant activity",
    )
    archived = models.BooleanField(
        default=False,
        help_text="Archived interviews are retired after HR-approved retake",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    submission_date = models.DateTimeField(null=True, blank=True, help_text="When applicant submitted all responses")
    completed_at = models.DateTimeField(null=True, blank=True)
    # Error message for failed status
    error_message = models.TextField(blank=True, null=True, help_text="Error details if processing failed")
    processing_status = models.CharField(
        max_length=20,
        choices=PROCESSING_STATUS_CHOICES,
        default="IDLE",
        help_text="Async processing lifecycle state for interview analysis",
    )
    processing_task_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Celery task ID for async interview processing",
    )
    processing_error = models.TextField(
        blank=True,
        null=True,
        help_text="Processing error details for async interview processing",
    )
    processing_started_at = models.DateTimeField(null=True, blank=True)
    processing_finished_at = models.DateTimeField(null=True, blank=True)
    
    # Authenticity Tracking
    authenticity_flag = models.BooleanField(
        default=False,
        help_text="True if any questions flagged for script reading"
    )
    authenticity_status = models.CharField(
        max_length=20,
        choices=[
            ('verified', 'Verified'),
            ('under_investigation', 'Under Investigation'),
            ('failed_authenticity', 'Failed Authenticity Check')
        ],
        default='verified',
        help_text="Overall authenticity status of interview"
    )
    authenticity_notes = models.TextField(
        blank=True,
        help_text="HR notes on authenticity investigation"
    )
    consent_acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when the applicant acknowledged the integrity notice",
    )
    integrity_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Advisory integrity signals captured during the interview session",
    )

    # HR Decision Tracking
    hr_decision = models.CharField(
        max_length=20,
        choices=HR_DECISION_CHOICES,
        null=True,
        blank=True,
        help_text="Final HR decision for the interview"
    )
    hr_decision_reason = models.TextField(
        null=True,
        blank=True,
        help_text="Optional HR decision rationale"
    )
    hr_decision_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interview_hr_decisions",
        help_text="HR user who recorded the decision"
    )
    hr_decision_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when HR recorded the decision"
    )
    final_decision = models.CharField(
        max_length=10,
        choices=FINAL_DECISION_CHOICES,
        null=True,
        blank=True,
        help_text="HR decision outcome for applicant notification (pass/review/fail)"
    )
    decision_set_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interview_decisions",
        help_text="HR user who set the final decision"
    )
    decision_set_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when HR set the final decision"
    )
    email_sent = models.BooleanField(
        default=False,
        help_text="Whether the decision email has been sent"
    )
    email_sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when decision email was sent"
    )
    email_queued_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when email delivery was queued",
    )
    email_last_error = models.TextField(
        null=True,
        blank=True,
        help_text="Last email delivery error, if any",
    )
    is_retake = models.BooleanField(
        default=False,
        help_text="True when interview was created as an HR-approved retake",
    )
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Expiration timestamp for interview access",
    )
    selected_question_ids = models.JSONField(
        default=list,
        blank=True,
        help_text="Ordered list of question IDs selected for this interview"
    )
    selected_question_metadata = models.JSONField(
        default=list,
        blank=True,
        help_text="Selection metadata per slot (slot competency, selected competency, fallback)"
    )
    
    class Meta:
        db_table = 'interviews'
        verbose_name = 'Interview'
        verbose_name_plural = 'Interviews'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status'], name='idx_interview_status'),
            models.Index(fields=['created_at'], name='idx_interview_created'),
            models.Index(fields=['applicant'], name='idx_interview_applicant'),
            models.Index(fields=['position_type'], name='idx_interview_position'),
        ]
    
    def __str__(self):
        return f"{self.applicant.full_name} - {self.get_interview_type_display()} ({self.status})"

    def save(self, *args, **kwargs):
        pending_hr_states = {None, "", "pending", "pending_hr_review"}
        should_auto_reject = self.status == "failed" and self.hr_decision in pending_hr_states
        update_fields = kwargs.get("update_fields")
        if should_auto_reject:
            # Avoid leaving failed interviews in a pending HR decision state.
            self.hr_decision = "reject"
            if self.hr_decision_at is None:
                self.hr_decision_at = timezone.now()
            if update_fields is not None:
                update_fields = set(update_fields)
                update_fields.update({"hr_decision", "hr_decision_at"})
                kwargs["update_fields"] = update_fields

        super().save(*args, **kwargs)

        if should_auto_reject:
            try:
                result = self.result
            except Exception:
                result = None
            if result and result.hr_decision in pending_hr_states:
                result.hr_decision = "reject"
                if result.hr_decision_at is None:
                    result.hr_decision_at = timezone.now()
                result.save(update_fields=["hr_decision", "hr_decision_at"])
    
    def check_authenticity(self):
        """
        Check if any video responses are flagged for script reading
        Updates authenticity_flag and authenticity_status
        """
        suspicious_count = self.video_responses.filter(
            script_reading_status='suspicious'
        ).count()
        high_risk_count = self.video_responses.filter(
            script_reading_status='high_risk'
        ).count()
        
        if high_risk_count > 0:
            self.authenticity_flag = True
            self.authenticity_status = 'under_investigation'
        elif suspicious_count > 0:
            self.authenticity_flag = True
            self.authenticity_status = 'under_investigation'
        else:
            self.authenticity_flag = False
            self.authenticity_status = 'verified'
        
        self.save()
        return self.authenticity_status
    
    @cached_property
    def active_questions(self):
        """
        Active questions filtered by position.
        position_type = concrete job position (e.g., Network Engineer)
        category = broader job category (e.g., IT Support)
        """
        if getattr(self, "selected_question_ids", None):
            selected_ids = list(self.selected_question_ids)
            if not selected_ids:
                return []
            qs = InterviewQuestion.objects.filter(id__in=selected_ids)
            question_map = {q.id: q for q in qs}
            return [question_map[qid] for qid in selected_ids if qid in question_map]
        if not self.position_type_id:
            return []
        return list(
            InterviewQuestion.objects.filter(
                is_active=True,
                position_type_id=self.position_type_id,
            ).order_by("order")
        )


class InterviewAuditLog(models.Model):
    """Audit log for interview resume/retake events."""

    EVENT_CHOICES = [
        ("resume_access", "Resume Access"),
        ("resume_resend", "Resume Resend"),
        ("retake_approved", "Retake Approved"),
        ("answer_recorded", "Answer Recorded"),
        ("answer_time_limit", "Answer Time Limit"),
    ]

    interview = models.ForeignKey(
        Interview,
        on_delete=models.CASCADE,
        related_name="audit_logs",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="interview_audit_logs",
        help_text="HR user who triggered the event (null for applicant access)",
    )
    event_type = models.CharField(max_length=30, choices=EVENT_CHOICES)
    metadata = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "interview_audit_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.interview_id} - {self.event_type}"

class VideoResponse(models.Model):
    """Model for video responses to interview questions"""
    
    STATUS_CHOICES = [
        ('uploaded', 'Uploaded'),
        ('processing', 'Processing'),
        ('analyzed', 'Analyzed'),
        ('failed', 'Failed'),
    ]
    
    interview = models.ForeignKey(Interview, on_delete=models.CASCADE, related_name='video_responses')
    question = models.ForeignKey(InterviewQuestion, on_delete=models.CASCADE, related_name='responses')
    video_file_path = models.FileField(upload_to='video_responses/%Y/%m/%d/')
    duration = models.DurationField(help_text="Duration of the video response")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='uploaded')
    
    # AI Analysis fields (stored directly for quick access)
    transcript = models.TextField(blank=True, help_text="Transcribed text from video")
    ai_score = models.FloatField(null=True, blank=True, help_text="AI-generated score (0-100)")
    sentiment = models.FloatField(null=True, blank=True, help_text="Sentiment score")
    
    # HR Override fields
    hr_override_score = models.IntegerField(
        null=True, 
        blank=True,
        help_text="HR can override AI score if incorrect"
    )
    hr_comments = models.TextField(
        blank=True,
        help_text="HR comments on the response"
    )
    hr_reviewed_at = models.DateTimeField(null=True, blank=True)
    hr_reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True,
        blank=True,
        related_name='reviewed_videos'
    )
    
    # Script Reading Detection fields
    script_reading_status = models.CharField(
        max_length=20,
        choices=[
            ('clear', 'Clear'),
            ('suspicious', 'Suspicious'),
            ('high_risk', 'High Risk')
        ],
        null=True,
        blank=True,
        help_text="Script reading detection result"
    )
    script_reading_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Detailed gaze tracking data (camera %, directions, patterns)"
    )
    
    # Deprecated field (keeping for backward compatibility)
    processed = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'video_responses'
        verbose_name = 'Video Response'
        verbose_name_plural = 'Video Responses'
        ordering = ['interview', 'question__order']
        unique_together = ['interview', 'question']
        indexes = [
            models.Index(fields=['uploaded_at'], name='idx_vr_uploaded_at'),
            models.Index(fields=['status'], name='idx_vr_status'),
            models.Index(fields=['interview'], name='idx_vr_interview'),
        ]
    
    def __str__(self):
        return f"Response: {self.interview.applicant.full_name} - Q{self.question.order}"
    
    @property
    def final_score(self):
        """Return HR override score if exists, otherwise AI score"""
        return self.hr_override_score if self.hr_override_score is not None else self.ai_score


class AIAnalysis(models.Model):
    """Model for AI analysis results of video responses"""
    
    RECOMMENDATION_CHOICES = [
        ('pass', 'Pass'),
        ('fail', 'Fail'),
        ('review', 'Needs Review'),
    ]
    
    video_response = models.OneToOneField(VideoResponse, on_delete=models.CASCADE, related_name='ai_analysis')
    transcript_text = models.TextField(help_text="Transcribed text from video")
    
    # Scoring metrics
    sentiment_score = models.FloatField(default=0.0, help_text="Sentiment analysis score")
    confidence_score = models.FloatField(default=0.0, help_text="Response confidence score")
    body_language_analysis = models.JSONField(default=dict, help_text="Body language analysis data")
    speech_clarity_score = models.FloatField(default=0.0, help_text="Speech clarity score")
    content_relevance_score = models.FloatField(default=0.0, help_text="Content relevance score")
    overall_score = models.FloatField(default=0.0, help_text="Overall score out of 100")
    
    # AI recommendation
    recommendation = models.CharField(max_length=10, choices=RECOMMENDATION_CHOICES)
    langchain_analysis_data = models.JSONField(default=dict, help_text="Raw LangChain/Gemini analysis data")
    
    analyzed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'ai_analyses'
        verbose_name = 'AI Analysis'
        verbose_name_plural = 'AI Analyses'
        ordering = ['-analyzed_at']
    
    def __str__(self):
        return f"Analysis: {self.video_response.interview.applicant.full_name} - Score: {self.overall_score}"


class JobPosition(models.Model):
    """Model for Job Positions"""

    name = models.CharField(max_length=255)
    code = models.SlugField(unique=True)
    description = models.TextField()
    about_role = models.TextField(blank=True)
    key_responsibilities = models.JSONField(default=list, blank=True)
    required_skills = models.JSONField(default=list, blank=True)
    qualifications = models.JSONField(default=list, blank=True)
    salary_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    salary_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    salary_currency = models.CharField(max_length=10, default="PHP")
    is_active = models.BooleanField(default=True)
    job_category = models.ForeignKey(
        PositionType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='job_positions'
    )
    category = models.ForeignKey(
        PositionType,
        on_delete=models.PROTECT,
        related_name='positions',
        null=False,
        blank=False
    )
    offices = models.ManyToManyField(
        OfficeLocation,
        blank=True,
        related_name='job_positions'
    )
    subroles = models.JSONField(default=list, blank=True, help_text="(Deprecated) legacy subroles; questions are competency-based.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_job_positions'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'job_positions'
        verbose_name = 'Job Position'
        verbose_name_plural = 'Job Positions'
        ordering = ['-created_at']

    def __str__(self):
        return self.name
