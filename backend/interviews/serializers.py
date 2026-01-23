from rest_framework import serializers
import logging
from django.conf import settings
from .models import (
    Interview,
    InterviewQuestion,
    VideoResponse,
    AIAnalysis,
    JobPosition,
    COMPETENCY_CHOICES,
)
from .type_models import PositionType, QuestionType
from .type_serializers import JobCategorySerializer, QuestionTypeSerializer
from applicants.serializers import ApplicantListSerializer
from applicants.models import OfficeLocation
from django.db.models import Q
from applicants.models import Applicant
from .question_alignment import get_alignment_error


def _debug_print(*args, **kwargs):
    if settings.DEBUG:
        print(*args, **kwargs)


class OfficeMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = OfficeLocation
        fields = ("id", "name")


class JobPositionSerializer(serializers.ModelSerializer):
    offices_detail = OfficeMiniSerializer(source="offices", many=True, read_only=True)
    offices = serializers.PrimaryKeyRelatedField(many=True, queryset=OfficeLocation.objects.all())
    category = serializers.PrimaryKeyRelatedField(queryset=PositionType.objects.all())
    category_detail = JobCategorySerializer(source="category", read_only=True)
    created_by = serializers.ReadOnlyField(source='created_by.username')

    class Meta:
        model = JobPosition
        fields = [
            "id",
            "name",
            "code",
            "description",
            "about_role",
            "key_responsibilities",
            "required_skills",
            "qualifications",
            "salary_min",
            "salary_max",
            "salary_currency",
            "is_active",
            "job_category",
            "category",
            "category_detail",
            "offices",
            "offices_detail",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ['created_at', 'updated_at', 'created_by']


class PublicJobPositionSerializer(serializers.ModelSerializer):
    offices_detail = OfficeMiniSerializer(source="offices", many=True, read_only=True)
    category_detail = JobCategorySerializer(source="category", read_only=True)

    class Meta:
        model = JobPosition
        fields = [
            "id",
            "name",
            "code",
            "description",
            "about_role",
            "key_responsibilities",
            "required_skills",
            "qualifications",
            "salary_min",
            "salary_max",
            "salary_currency",
            "is_active",
            "category_detail",
            "offices_detail",
        ]


class InterviewQuestionSerializer(serializers.ModelSerializer):
    """Serializer for interview questions (competency-based, tags removed)"""
    
    question_type_detail = QuestionTypeSerializer(source='question_type', read_only=True)
    job_category_detail = JobCategorySerializer(source='position_type', read_only=True)
    category_detail = JobCategorySerializer(source='category', read_only=True)
    competency = serializers.ChoiceField(choices=COMPETENCY_CHOICES)
    tags = serializers.ListField(read_only=True)
    question_type_id = serializers.PrimaryKeyRelatedField(
        source='question_type',
        queryset=serializers.SerializerMethodField(),
        write_only=True,
        required=False
    )
    category_id = serializers.PrimaryKeyRelatedField(
        source='category',
        queryset=serializers.SerializerMethodField(),
        write_only=True,
        required=True,
        help_text="Job category (PositionType) this question is for",
    )
    
    class Meta:
        model = InterviewQuestion
        fields = [
            'id',
            'question_text',
            'question_type',
            'position_type',
            'category',
            'competency',
            'tags',
            'order',
            'question_type_detail',
            'job_category_detail',
            'category_detail',
            'question_type_id',
            'category_id',
        ]
        read_only_fields = ['position_type', 'tags', 'order']
    
    def get_fields(self):
        fields = super().get_fields()
        from .type_models import QuestionType, PositionType
        fields['question_type_id'].queryset = QuestionType.objects.filter(is_active=True)
        fields['category_id'].queryset = PositionType.objects.filter(is_active=True)
        return fields

    def validate(self, attrs):
        # Mirror category into position_type to keep selection logic category-based
        category = attrs.get("category") or getattr(self.instance, "category", None)
        if not category:
            raise serializers.ValidationError({"category": "Job category is required for initial interview questions."})
        if not attrs.get("competency") and not getattr(self.instance, "competency", None):
            raise serializers.ValidationError({"competency": "Competency is required for initial interview questions."})
        if category and not attrs.get("position_type"):
            attrs["position_type"] = category
        return attrs


class InterviewQuestionWriteSerializer(serializers.ModelSerializer):
    """
    Write-focused serializer with a minimal, explicit contract.
    Accepts IDs for question_type and category (job category).
    Legacy fields (position_type, tags, order) are ignored or read-only.
    """

    question_text = serializers.CharField(required=True)
    question_type = serializers.PrimaryKeyRelatedField(
        queryset=QuestionType.objects.all(),
        required=True,
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=PositionType.objects.all(),
        required=True,
    )
    competency = serializers.ChoiceField(choices=COMPETENCY_CHOICES, required=True)

    class Meta:
        model = InterviewQuestion
        fields = [
            "id",
            "question_text",
            "question_type",
            "category",
            "competency",
        ]
        read_only_fields = ["id"]

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            return super().to_internal_value(data)
        if hasattr(data, "dict"):
            mutable = data.dict()
        else:
            mutable = dict(data)
        if "question_type" not in mutable and "question_type_id" in mutable:
            mutable["question_type"] = mutable.get("question_type_id")
        if "category" not in mutable and "category_id" in mutable:
            mutable["category"] = mutable.get("category_id")
        if "competency" in mutable:
            mutable["competency"] = self._normalize_competency(mutable.get("competency"))
        for key in ["position_type", "tags", "subroles", "order"]:
            mutable.pop(key, None)
        allowed = set(self.fields.keys())
        sanitized = {key: value for key, value in mutable.items() if key in allowed}
        return super().to_internal_value(sanitized)

    def _normalize_competency(self, value):
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        if not stripped:
            return value
        choice_map = {label.lower(): key for key, label in COMPETENCY_CHOICES}
        if stripped in dict(COMPETENCY_CHOICES):
            return stripped
        lowered = stripped.lower()
        if lowered in choice_map:
            return choice_map[lowered]
        return value

    def validate(self, attrs):
        # Mirror category into position_type for backward compatibility
        category = attrs.get("category") or getattr(self.instance, "category", None)
        if category:
            attrs["position_type"] = category
        question_text = attrs.get("question_text") or getattr(self.instance, "question_text", None)
        assigned_code = getattr(category, "code", None)
        if self.instance is not None:
            error = get_alignment_error(question_text, assigned_code)
            if error:
                raise serializers.ValidationError({"position_type": error})
        return attrs


class AIAnalysisSerializer(serializers.ModelSerializer):
    """Serializer for AI analysis results"""
    
    class Meta:
        model = AIAnalysis
        fields = [
            'id',
            'transcript_text',
            'sentiment_score',
            'confidence_score',
            'body_language_analysis',
            'speech_clarity_score',
            'content_relevance_score',
            'overall_score',
            'recommendation',
            'langchain_analysis_data',
            'analyzed_at'
        ]
        read_only_fields = ['id', 'analyzed_at']


class VideoResponseSerializer(serializers.ModelSerializer):
    """Serializer for video responses"""
    
    question = InterviewQuestionSerializer(read_only=True)
    question_id = serializers.IntegerField(write_only=True)
    ai_analysis = AIAnalysisSerializer(read_only=True)
    final_score = serializers.ReadOnlyField()
    hr_reviewer_name = serializers.SerializerMethodField()
    
    class Meta:
        model = VideoResponse
        fields = [
            'id',
            'question',
            'question_id',
            'video_file_path',
            'duration',
            'uploaded_at',
            'status',
            'transcript',
            'ai_score',
            'sentiment',
            'hr_override_score',
            'hr_comments',
            'hr_reviewed_at',
            'hr_reviewer',
            'hr_reviewer_name',
            'final_score',
            'script_reading_status',
            'script_reading_data',
            'processed',
            'ai_analysis'
        ]
        read_only_fields = [
            'id',
            'uploaded_at',
            'status',
            'transcript',
            'ai_score',
            'sentiment',
            'hr_reviewed_at',
            'hr_reviewer',
            'processed'
        ]
    
    def get_hr_reviewer_name(self, obj):
        """Get HR reviewer's name"""
        if obj.hr_reviewer:
            return f"{obj.hr_reviewer.first_name} {obj.hr_reviewer.last_name}"
        return None


class VideoResponseCreateSerializer(serializers.Serializer):
    """Serializer for creating video responses"""
    
    question_id = serializers.IntegerField(required=True)
    video_file_path = serializers.FileField(required=True)
    duration = serializers.DurationField(required=True)
    
    def validate_question_id(self, value):
        """Validate that question exists and is active"""
        try:
            question = InterviewQuestion.objects.get(id=value, is_active=True)
        except InterviewQuestion.DoesNotExist:
            raise serializers.ValidationError("Invalid or inactive question.")
        return value


class HRDecisionSerializer(serializers.Serializer):
    """Serializer for HR interview decision updates"""

    decision = serializers.ChoiceField(
        choices=["hire", "reject", "hold"],
        required=True,
    )
    hr_comment = serializers.CharField(required=False, allow_blank=True)
    hold_until = serializers.DateTimeField(required=False, allow_null=True)
    reopen_review = serializers.BooleanField(required=False)

    def validate(self, attrs):
        decision = attrs.get("decision")
        hr_comment = (attrs.get("hr_comment") or "").strip()
        hold_until = attrs.get("hold_until")

        if decision == "hold":
            if not hr_comment:
                raise serializers.ValidationError({"hr_comment": "Comment is required when placing on hold."})
            if not hold_until:
                raise serializers.ValidationError({"hold_until": "Hold-until date is required when placing on hold."})

        return attrs


class DecisionEmailSerializer(serializers.Serializer):
    """Serializer for HR decision email sending"""

    final_decision = serializers.ChoiceField(
        choices=["PASS", "REVIEW", "FAIL"],
        required=True,
    )
    custom_message = serializers.CharField(required=False, allow_blank=True)
    include_feedback = serializers.BooleanField(required=False, default=True)
    feedback_override = serializers.CharField(required=False, allow_blank=True)

    def validate_final_decision(self, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value


class InterviewSerializer(serializers.ModelSerializer):
    """Serializer for interview model"""
    
    applicant = ApplicantListSerializer(read_only=True)
    video_responses = VideoResponseSerializer(many=True, read_only=True)
    questions = serializers.SerializerMethodField()
    category_detail = JobCategorySerializer(source="position_type", read_only=True)
    position_type = serializers.SerializerMethodField()
    
    class Meta:
        model = Interview
        fields = [
            'id',
            'applicant',
            'interview_type',
            'position_type',
            'category_detail',
            'status',
            'archived',
            'is_retake',
            'expires_at',
            'hr_decision',
            'hr_decision_reason',
            'hr_decision_at',
            'final_decision',
            'decision_set_at',
            'email_sent',
            'email_sent_at',
            'created_at',
            'submission_date',
            'completed_at',
            'authenticity_flag',
            'authenticity_status',
            'authenticity_notes',
            'consent_acknowledged_at',
            'integrity_metadata',
            'questions',
            'video_responses'
        ]
        read_only_fields = [
            'id',
            'created_at',
            'submission_date',
            'completed_at',
            'status',
            'archived',
            'is_retake',
            'expires_at',
            'authenticity_flag',
            'authenticity_status',
            'hr_decision',
            'hr_decision_reason',
            'hr_decision_at',
            'final_decision',
            'decision_set_at',
            'email_sent',
            'email_sent_at',
            'consent_acknowledged_at',
            'integrity_metadata',
        ]
    
    def get_position_type(self, obj):
        """Return position type code as string"""
        if obj.position_type:
            return obj.position_type.code
        return None
    
    def get_questions(self, obj):
        """Get active questions for the interview filtered by position type (position-first)."""
        if getattr(obj, "selected_question_ids", None):
            selected_ids = list(obj.selected_question_ids)
            if not selected_ids:
                return []
            from .models import InterviewQuestion
            qs = InterviewQuestion.objects.filter(id__in=selected_ids)
            question_map = {q.id: q for q in qs}
            ordered = [question_map[qid] for qid in selected_ids if qid in question_map]
            return InterviewQuestionSerializer(ordered, many=True).data
        if not obj.position_type_id:
            return []
        from .question_selection import select_questions_for_interview

        qs = select_questions_for_interview(obj)
        return InterviewQuestionSerializer(qs, many=True).data


class InterviewCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating interviews with position_type PK"""
    
    applicant = serializers.PrimaryKeyRelatedField(queryset=Applicant.objects.all())
    position_type = serializers.PrimaryKeyRelatedField(queryset=PositionType.objects.all())
    job_position_id = serializers.IntegerField(required=False, allow_null=True)
    
    class Meta:
        model = Interview
        fields = ['applicant', 'interview_type', 'position_type', 'job_position_id']
    
    def create(self, validated_data):
        job_position_id = validated_data.pop("job_position_id", None)
        validated_data['status'] = 'pending'
        _debug_print("DEBUG_INTERVIEW_INPUT:", validated_data)
        interview = super().create(validated_data)

        # Update applicant status
        applicant = validated_data.get('applicant')
        if applicant:
            applicant.status = 'in_review'
            try:
                applicant.save(update_fields=["status"])
            except Exception:
                logging.getLogger(__name__).warning(
                    "Applicant status update failed during interview creation",
                    extra={"applicant_id": getattr(applicant, "id", None), "interview_id": interview.id},
                )
        # Queue processing record
        from processing.models import ProcessingQueue
        ProcessingQueue.objects.create(
            interview=interview,
            status='queued'
        )
        _debug_print("DEBUG_INTERVIEW_OBJ:", interview)
        return interview



class InterviewAnalysisSerializer(serializers.Serializer):
    """Serializer for interview analysis results"""
    
    interview_id = serializers.IntegerField()
    applicant_name = serializers.CharField()
    overall_score = serializers.FloatField()
    sentiment_score = serializers.FloatField()
    confidence_score = serializers.FloatField()
    speech_clarity_score = serializers.FloatField()
    content_relevance_score = serializers.FloatField()
    raw_scores_per_competency = serializers.DictField()
    weighted_scores_per_competency = serializers.DictField()
    final_weighted_score = serializers.FloatField()
    weights_used = serializers.DictField()
    role_profile = serializers.CharField()
    ai_recommendation_explanation = serializers.CharField()
    total_questions = serializers.IntegerField()
    answered_questions = serializers.IntegerField()
    recommendation = serializers.CharField()
    video_responses = VideoResponseSerializer(many=True)
    
    def to_representation(self, instance):
        """Custom representation for analysis data"""
        video_responses = instance.video_responses.all()
        
        # Calculate average scores across all AI analyses
        total_overall = 0
        total_sentiment = 0
        total_confidence = 0
        total_clarity = 0
        total_content = 0
        count = 0
        scores_by_competency = {}
        
        for response in video_responses:
            if hasattr(response, 'ai_analysis'):
                ai = response.ai_analysis
                total_overall += ai.overall_score
                total_sentiment += ai.sentiment_score
                total_confidence += ai.confidence_score
                total_clarity += ai.speech_clarity_score
                total_content += ai.content_relevance_score
                count += 1
            score = response.final_score
            if score is not None:
                competency = getattr(response.question, "competency", None) or "communication"
                bucket_total, bucket_count = scores_by_competency.get(competency, (0.0, 0))
                scores_by_competency[competency] = (bucket_total + score, bucket_count + 1)
        
        if count > 0:
            avg_overall = total_overall / count
            avg_sentiment = total_sentiment / count
            avg_confidence = total_confidence / count
            avg_clarity = total_clarity / count
            avg_content = total_content / count
        else:
            avg_overall = avg_sentiment = avg_confidence = avg_clarity = avg_content = 0
        
        from interviews.scoring import compute_competency_scores

        competency_score_data = compute_competency_scores(
            scores_by_competency=scores_by_competency,
            role_code=getattr(instance.position_type, "code", None),
        )

        final_weighted_score = competency_score_data["final_weighted_score"]

        # Determine recommendation based on weighted score
        if final_weighted_score >= 70:
            recommendation = 'pass'
        elif final_weighted_score >= 50:
            recommendation = 'review'
        else:
            recommendation = 'fail'
        
        # Total questions = number of questions actually answered in this interview
        answered_count = video_responses.count()
        
        return {
            'interview_id': instance.id,
            'applicant_name': instance.applicant.full_name,
            'overall_score': round(final_weighted_score, 2),
            'sentiment_score': round(avg_sentiment, 2),
            'confidence_score': round(avg_confidence, 2),
            'speech_clarity_score': round(avg_clarity, 2),
            'content_relevance_score': round(avg_content, 2),
            'raw_scores_per_competency': competency_score_data["raw_scores_per_competency"],
            'weighted_scores_per_competency': competency_score_data["weighted_scores_per_competency"],
            'final_weighted_score': round(final_weighted_score, 2),
            'weights_used': competency_score_data["weights_used"],
            'role_profile': competency_score_data["role_profile"],
            'ai_recommendation_explanation': competency_score_data["ai_recommendation_explanation"],
            'total_questions': answered_count,
            'answered_questions': answered_count,
            'recommendation': recommendation,
            'video_responses': VideoResponseSerializer(video_responses, many=True).data
        }


# New serializers for bulk processing approach


class VideoResponseUploadSerializer(serializers.ModelSerializer):
    """Simplified serializer for video upload WITHOUT immediate analysis"""
    
    video_file = serializers.FileField(write_only=True, source='video_file_path')
    question_id = serializers.IntegerField(write_only=True)
    
    class Meta:
        model = VideoResponse
        fields = [
            'id',
            'question_id',
            'video_file',
            'duration',
            'uploaded_at',
            'status'
        ]
        read_only_fields = ['id', 'uploaded_at', 'status']


class InterviewSubmissionResponseSerializer(serializers.Serializer):
    """Response serializer for interview submission"""
    
    message = serializers.CharField()
    queue_id = serializers.IntegerField()
    status = serializers.CharField()
    estimated_completion = serializers.CharField()


class ProcessingProgressSerializer(serializers.Serializer):
    """Serializer for processing progress details"""
    
    total_videos = serializers.IntegerField()
    processed = serializers.IntegerField()
    remaining = serializers.IntegerField()


class ProcessingStatusResponseSerializer(serializers.Serializer):
    """Response serializer for processing status"""
    
    status = serializers.CharField()
    progress = ProcessingProgressSerializer()
    estimated_time_remaining = serializers.CharField()
    message = serializers.CharField(required=False)


class InterviewListSerializer(serializers.ModelSerializer):
    applicant_name = serializers.CharField(source="applicant.full_name", read_only=True)
    applicant_full_name = serializers.SerializerMethodField()
    applicant_email = serializers.EmailField(source="applicant.email", read_only=True)
    applicant_phone = serializers.CharField(source="applicant.phone", read_only=True)
    applicant_created_at = serializers.DateTimeField(source="applicant.created_at", read_only=True)
    applicant_position_applied = serializers.SerializerMethodField()
    position = serializers.SerializerMethodField()
    is_archived = serializers.BooleanField(source="archived", read_only=True)

    class Meta:
        model = Interview
        fields = [
            "id",
            "status",
            "archived",
            "is_archived",
            "is_retake",
            "expires_at",
            "hr_decision",
            "created_at",
            "position_type",
            "applicant_name",
            "applicant_full_name",
            "applicant_email",
            "applicant_phone",
            "applicant_created_at",
            "applicant_position_applied",
            "position",
        ]

    def get_position(self, obj):
        return obj.position_type.code if obj.position_type else None

    def get_applicant_full_name(self, obj):
        """
        Lightweight display name for list views; do not add heavy applicant data here.
        """
        applicant = getattr(obj, "applicant", None)
        if not applicant:
            return None
        first = getattr(applicant, "first_name", "") or ""
        last = getattr(applicant, "last_name", "") or ""
        full = f"{first} {last}".strip()
        return full if full else getattr(applicant, "full_name", None)

    def get_applicant_position_applied(self, obj):
        applicant = getattr(obj, "applicant", None)
        if applicant is not None:
            position_name = getattr(applicant, "latest_position_name", None)
            if position_name:
                return position_name
        position_type = getattr(obj, "position_type", None)
        return getattr(position_type, "name", None)
    
    
