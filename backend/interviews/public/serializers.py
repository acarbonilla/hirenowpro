from rest_framework import serializers
from interviews.models import Interview, InterviewQuestion
from interviews.type_models import PositionType
from interviews.type_serializers import JobCategorySerializer
from applicants.models import Applicant


class PublicQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = ["id", "question_text", "order", "tags"]


class PublicApplicantSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    location_type = serializers.SerializerMethodField()

    class Meta:
        model = Applicant
        fields = ["id", "full_name", "email", "phone", "location_type"]

    def get_location_type(self, obj):
        return getattr(obj, "geo_status", None) or getattr(obj, "application_type", None)


class PublicInterviewSerializer(serializers.ModelSerializer):
    questions = serializers.SerializerMethodField()
    category_detail = JobCategorySerializer(source="position_type", read_only=True)
    position_type = serializers.SerializerMethodField()

    class Meta:
        model = Interview
        fields = [
            "id",
            "interview_type",
            "position_type",
            "category_detail",
            "status",
            "created_at",
            "questions",
        ]

    def get_position_type(self, obj):
        return obj.position_type.code if obj.position_type else None

    def get_questions(self, obj):
        qs = InterviewQuestion.objects.filter(is_active=True).order_by("order")
        if obj.position_type_id:
            qs = qs.filter(category_id=obj.position_type_id)
        return PublicQuestionSerializer(qs, many=True).data
