from rest_framework import serializers
from interviews.models import Interview, InterviewQuestion, JobPosition
from interviews.type_serializers import JobCategorySerializer
from applicants.models import Applicant
from interviews.type_models import PositionType
from interviews.question_selection import select_questions_for_interview


class PublicQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = ["id", "question_text", "order", "competency"]


class PublicApplicantSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    location_type = serializers.SerializerMethodField()

    class Meta:
        model = Applicant
        fields = ["id", "full_name", "email", "phone", "location_type"]

    def get_location_type(self, obj):
        return getattr(obj, "geo_status", None) or getattr(obj, "application_type", None)


class PublicInterviewSerializer(serializers.ModelSerializer):
    public_id = serializers.UUIDField(read_only=True)
    applicant = PublicApplicantSerializer(read_only=True)
    questions = serializers.SerializerMethodField()
    category_detail = JobCategorySerializer(source="position_type", read_only=True)
    position_type = serializers.SerializerMethodField()
    answered_question_ids = serializers.SerializerMethodField()

    class Meta:
        model = Interview
        fields = [
            "public_id",
            "applicant",
            "interview_type",
            "position_type",
            "category_detail",
            "status",
            "attempt_number",
            "current_question_index",
            "archived",
            "is_retake",
            "expires_at",
            "created_at",
            "questions",
            "answered_question_ids",
        ]

    def get_position_type(self, obj):
        return obj.position_type.code if obj.position_type else None

    def get_questions(self, obj):
        if getattr(obj, "selected_question_ids", None):
            selected_ids = list(obj.selected_question_ids)
            if not selected_ids:
                return []
            qs = InterviewQuestion.objects.filter(id__in=selected_ids)
            question_map = {q.id: q for q in qs}
            ordered = [question_map[qid] for qid in selected_ids if qid in question_map]
            return PublicQuestionSerializer(ordered, many=True).data
        if not obj.position_type_id:
            return []
        qs = select_questions_for_interview(obj)
        return PublicQuestionSerializer(qs, many=True).data

    def get_answered_question_ids(self, obj):
        return list(obj.video_responses.values_list('question_id', flat=True))


class PublicInterviewCreateSerializer(serializers.Serializer):
    applicant_id = serializers.IntegerField(required=False)
    applicant = serializers.IntegerField(required=False)
    interview_type = serializers.ChoiceField(
        choices=[choice[0] for choice in Interview.INTERVIEW_TYPE_CHOICES],
        required=False,
        default="initial_ai",
    )
    position_code = serializers.CharField(required=False, allow_blank=True)
    position_type_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        applicant_id = attrs.get("applicant_id") or attrs.get("applicant")
        if not applicant_id:
            raise serializers.ValidationError({"applicant_id": "Applicant ID is required."})

        applicant = Applicant.objects.filter(id=applicant_id).first()
        if not applicant:
            raise serializers.ValidationError({"applicant_id": "Applicant not found."})

        position_type = None
        position_type_id = attrs.get("position_type_id")
        if position_type_id:
            position_type = PositionType.objects.filter(id=position_type_id).first()

        position_code = (attrs.get("position_code") or "").strip()
        if not position_type and position_code:
            position_type = PositionType.objects.filter(code__iexact=position_code).first()
            if not position_type:
                job_position = JobPosition.objects.select_related("category").filter(code__iexact=position_code).first()
                if job_position and job_position.category_id:
                    position_type = job_position.category

        if not position_type:
            if position_type_id:
                raise serializers.ValidationError({"position_type_id": "Position type not found."})
            raise serializers.ValidationError({"position_code": "Position not found."})

        attrs["applicant"] = applicant
        attrs["position_type"] = position_type
        return attrs


class PublicJobPositionSerializer(serializers.ModelSerializer):
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
            "category",
            "category_detail",
        ]
