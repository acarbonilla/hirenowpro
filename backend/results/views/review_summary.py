from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsHRUser
from results.models import InterviewResult
from results.serializers import ReviewSummarySerializer


class InterviewReviewSummary(APIView):
    """
    Fast, lightweight interview review summary for HR.
    """

    permission_classes = [IsAuthenticated, IsHRUser]

    def get(self, request, pk):
        result = (
            InterviewResult.objects.select_related("interview", "interview__applicant")
            .prefetch_related("interview__video_responses")
            .only(
                "id",
                "final_score",
                "hr_decision",
                "hr_comment",
                "hold_until",
                "hr_decision_at",
                "passed",
                "result_date",
                "interview__id",
                "interview__created_at",
                "interview__applicant__id",
                "interview__applicant__first_name",
                "interview__applicant__last_name",
                "interview__applicant__email",
                "interview__applicant__phone",
            )
            .filter(pk=pk)
            .first()
        )
        result = get_object_or_404(InterviewResult, pk=pk) if result is None else result

        serializer = ReviewSummarySerializer(result)
        data = serializer.data
        data["video_responses"] = []  # details endpoint fills this
        return Response(data)
