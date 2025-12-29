from rest_framework import serializers
from interviews.models import Interview, InterviewQuestion, JobPosition
from interviews.type_serializers import JobCategorySerializer
from applicants.models import Applicant
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
    questions = serializers.SerializerMethodField()
    category_detail = JobCategorySerializer(source="position_type", read_only=True)
    position_type = serializers.SerializerMethodField()
    answered_question_ids = serializers.SerializerMethodField()

    class Meta:
        model = Interview
        fields = [
            "id",
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


class PublicJobPositionSerializer(serializers.ModelSerializer):
    category_detail = JobCategorySerializer(source="category", read_only=True)

    class Meta:
        model = JobPosition
        fields = ["id", "name", "code", "description", "category", "category_detail"]
