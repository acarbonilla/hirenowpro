"""
Serializers for interview results and HR review
"""

from rest_framework import serializers
from .models import InterviewResult
from interviews.models import Interview, VideoResponse, InterviewQuestion
from applicants.serializers import ApplicantSerializer


class VideoResponseReviewSerializer(serializers.ModelSerializer):
    """Serializer for video response in HR review context"""
    
    question_text = serializers.CharField(source='question.question_text', read_only=True)
    question_type = serializers.CharField(source='question.question_type', read_only=True)
    expected_duration = serializers.DurationField(source='question.max_duration', read_only=True)
    video_url = serializers.SerializerMethodField()
    hr_reviewer_name = serializers.SerializerMethodField()
    final_score = serializers.ReadOnlyField()
    
    class Meta:
        model = VideoResponse
        fields = [
            'id',
            'question_id',
            'question_text',
            'question_type',
            'expected_duration',
            'video_url',
            'transcript',
            'duration',
            'ai_score',
            'sentiment',
            'script_reading_status',
            'script_reading_data',
            'hr_override_score',
            'hr_comments',
            'hr_reviewed_at',
            'hr_reviewer_name',
            'final_score'
        ]
    
    def get_video_url(self, obj):
        """Get video file URL"""
        if obj.video_file_path:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.video_file_path.url)
            return obj.video_file_path.url
        return None
    
    def get_hr_reviewer_name(self, obj):
        """Get HR reviewer's full name"""
        if obj.hr_reviewer:
            return f"{obj.hr_reviewer.first_name} {obj.hr_reviewer.last_name}".strip()
        return None


class InterviewSummarySerializer(serializers.Serializer):
    """Serializer for interview summary in review"""
    
    interview_id = serializers.IntegerField()
    interview_date = serializers.DateTimeField()
    submission_date = serializers.DateTimeField()
    overall_score = serializers.FloatField()
    recommendation = serializers.CharField()
    status = serializers.CharField()
    authenticity_flag = serializers.BooleanField()
    authenticity_status = serializers.CharField()
    authenticity_notes = serializers.CharField()


class ApplicantInfoSerializer(serializers.Serializer):
    """Serializer for applicant info in review"""
    
    name = serializers.CharField()
    email = serializers.EmailField()
    phone = serializers.CharField()
    applied_date = serializers.DateTimeField()


class FullReviewSerializer(serializers.Serializer):
    """Complete interview review serializer for HR"""
    
    applicant = ApplicantInfoSerializer()
    interview_summary = InterviewSummarySerializer()
    questions_and_answers = VideoResponseReviewSerializer(many=True)


class ScoreOverrideSerializer(serializers.Serializer):
    """Serializer for HR score override request"""
    
    video_response_id = serializers.IntegerField(required=True)
    override_score = serializers.IntegerField(required=True, min_value=0, max_value=100)
    comments = serializers.CharField(required=True, allow_blank=False)
    
    def validate_override_score(self, value):
        """Validate score is between 0-100"""
        if not 0 <= value <= 100:
            raise serializers.ValidationError("Score must be between 0 and 100")
        return value


class AuthenticityCheckSerializer(serializers.Serializer):
    """Serializer for HR authenticity check actions"""
    
    ACTION_CHOICES = [
        ('clear_flag', 'Clear Flag'),
        ('confirm_issue', 'Confirm Issue'),
        ('request_reinterview', 'Request Re-interview')
    ]
    
    action = serializers.ChoiceField(choices=ACTION_CHOICES, required=True)
    notes = serializers.CharField(required=True, allow_blank=False)
    
    def validate_notes(self, value):
        """Require meaningful notes"""
        if len(value.strip()) < 10:
            raise serializers.ValidationError("Notes must be at least 10 characters")
        return value


class ScoreComparisonSerializer(serializers.Serializer):
    """Serializer for AI vs HR score comparison"""
    
    question_id = serializers.IntegerField()
    question_text = serializers.CharField()
    ai_score = serializers.FloatField()
    hr_override = serializers.IntegerField(allow_null=True)
    score_difference = serializers.IntegerField()


class ComparisonReportSerializer(serializers.Serializer):
    """Serializer for complete AI vs HR comparison report"""
    
    total_questions = serializers.IntegerField()
    ai_scores = serializers.ListField(child=serializers.FloatField())
    hr_overrides = serializers.ListField(child=serializers.IntegerField(allow_null=True))
    score_differences = serializers.ListField(child=serializers.IntegerField())
    agreement_rate = serializers.FloatField()
    detailed_comparisons = ScoreComparisonSerializer(many=True)


class InterviewResultSerializer(serializers.ModelSerializer):
    """Serializer for InterviewResult model"""
    
    applicant_name = serializers.CharField(source='interview.applicant.full_name', read_only=True)
    applicant_email = serializers.CharField(source='interview.applicant.email', read_only=True)
    interview_date = serializers.DateTimeField(source='interview.created_at', read_only=True)
    
    class Meta:
        model = InterviewResult
        fields = [
            'id',
            'interview',
            'applicant_name',
            'applicant_email',
            'interview_date',
            'overall_score',
            'recommendation',
            'status',
            'result_data',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class InterviewResultListSerializer(serializers.ModelSerializer):
    """Simplified serializer for list view"""
    
    applicant = serializers.SerializerMethodField()
    position_type = serializers.SerializerMethodField()
    overall_score = serializers.FloatField(source='final_score', read_only=True)
    recommendation = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    hr_reviewed_at = serializers.SerializerMethodField()
    hr_reviewer = serializers.SerializerMethodField()
    has_hr_overrides = serializers.SerializerMethodField()
    final_decision_by_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='result_date', read_only=True)
    
    class Meta:
        model = InterviewResult
        fields = [
            'id',
            'interview',
            'applicant',
            'position_type',
            'overall_score',
            'passed',
            'recommendation',
            'status',
            'has_hr_overrides',
            'hr_reviewed_at',
            'hr_reviewer',
            'final_decision',
            'final_decision_date',
            'final_decision_by_name',
            'final_decision_notes',
            'created_at'
        ]
    
    def get_applicant(self, obj):
        """Return applicant info as nested object"""
        return {
            'id': obj.applicant.id,
            'full_name': obj.applicant.full_name,
            'email': obj.applicant.email
        }
    
    def get_position_type(self, obj):
        """Return position type code"""
        if obj.interview and obj.interview.position_type:
            return obj.interview.position_type.code
        return None
    
    def get_recommendation(self, obj):
        """Get recommendation based on score and passed status"""
        # Use dynamic thresholds from SystemSettings
        from .models import SystemSettings
        passing_threshold = SystemSettings.get_passing_threshold()
        review_threshold = SystemSettings.get_review_threshold()
        
        # Example: passing=70, review=50
        # 70-100 = hire (strong performance, clear pass)
        # 50-69.9 = review (borderline cases that need HR judgment)
        # 0-49 = reject (weak performance, clear fail)
        if obj.final_score >= passing_threshold:
            return 'hire'
        elif obj.final_score >= review_threshold:
            return 'review'
        else:
            return 'reject'
    
    def get_status(self, obj):
        """Get result status based on score and HR review"""
        # Check if HR has reviewed
        hr_reviewed = obj.interview.video_responses.filter(
            hr_reviewed_at__isnull=False
        ).exists()
        
        if hr_reviewed:
            return 'Reviewed'
        
        # If not reviewed, show status based on score/recommendation
        recommendation = self.get_recommendation(obj)
        if recommendation == 'hire':
            return 'Passed'
        elif recommendation == 'review':
            return 'Pending'
        else:  # reject
            return 'Failed'
    
    def get_hr_reviewed_at(self, obj):
        """Get latest HR review timestamp from video responses"""
        latest_review = obj.interview.video_responses.filter(
            hr_reviewed_at__isnull=False
        ).order_by('-hr_reviewed_at').first()
        return latest_review.hr_reviewed_at if latest_review else None
    
    def get_hr_reviewer(self, obj):
        """Get HR reviewer info from latest review"""
        latest_review = obj.interview.video_responses.filter(
            hr_reviewer__isnull=False
        ).order_by('-hr_reviewed_at').first()
        if latest_review and latest_review.hr_reviewer:
            return {
                'id': latest_review.hr_reviewer.id,
                'username': latest_review.hr_reviewer.username,
                'full_name': f"{latest_review.hr_reviewer.first_name} {latest_review.hr_reviewer.last_name}".strip()
            }
        return None
    
    def get_has_hr_overrides(self, obj):
        """Check if interview has any HR overrides"""
        return obj.interview.video_responses.filter(
            hr_override_score__isnull=False
        ).exists()
    
    def get_final_decision_by_name(self, obj):
        """Get name of HR person who made final decision"""
        if obj.final_decision_by:
            return f"{obj.final_decision_by.first_name} {obj.final_decision_by.last_name}".strip() or obj.final_decision_by.username
        return None


class FinalDecisionSerializer(serializers.Serializer):
    """Serializer for HR final hiring decision"""
    
    decision = serializers.ChoiceField(
        choices=['hired', 'rejected'],
        required=True,
        help_text="Final hiring decision: 'hired' or 'rejected'"
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Optional notes about the decision"
    )
