from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from interviews.models import Interview, InterviewQuestion
from interviews.type_models import PositionType
from applicants.models import Applicant
from .serializers import (
    PublicInterviewSerializer,
    PublicQuestionSerializer,
)


class PublicInterviewCreateView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicInterviewSerializer

    def create(self, request, *args, **kwargs):
        applicant_id = request.data.get("applicant_id")
        position_code = request.data.get("position_code")
        interview_type = request.data.get("interview_type", "initial_ai")

        try:
            applicant = Applicant.objects.get(id=applicant_id)
        except Applicant.DoesNotExist:
            return Response({"error": "Applicant not found"}, status=status.HTTP_404_NOT_FOUND)

        position_type = PositionType.objects.filter(code=position_code).first()
        if not position_type:
            return Response({"error": "Position type not found"}, status=status.HTTP_400_BAD_REQUEST)

        interview = Interview.objects.create(
            applicant=applicant,
            position_type=position_type,
            interview_type=interview_type,
            status="pending",
        )
        serializer = self.get_serializer(interview)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PublicInterviewRetrieveView(generics.RetrieveAPIView):
    permission_classes = [AllowAny]
    queryset = Interview.objects.select_related("position_type")
    serializer_class = PublicInterviewSerializer


class PublicQuestionListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicQuestionSerializer

    def get_queryset(self):
        interview = get_object_or_404(Interview, id=self.kwargs.get("pk"))
        qs = InterviewQuestion.objects.filter(is_active=True).order_by("order")
        if interview.position_type_id:
            qs = qs.filter(category_id=interview.position_type_id)
        return qs


class PublicPositionTypeLookupView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = None  # set dynamically

    def get_serializer_class(self):
        from interviews.type_serializers import JobCategorySerializer
        return JobCategorySerializer

    def get_queryset(self):
        qs = PositionType.objects.all()
        position_code = self.request.query_params.get("position_code")
        if position_code:
            qs = qs.filter(positions__code=position_code)
        return qs
