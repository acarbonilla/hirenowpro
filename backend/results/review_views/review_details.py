from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from results.models import InterviewResult
from common.permissions import IsHRUser


class InterviewReviewDetails(APIView):
    permission_classes = [IsAuthenticated, IsHRUser]

    def get(self, request, pk):
        result = (
            InterviewResult.objects
            .prefetch_related("answers", "answers__question")
            .get(pk=pk)
        )

        return Response({
            "ai_analysis": result.ai_analysis,
            "question_breakdown": result.question_breakdown,
            "transcript": result.transcript,
            "notes": result.notes,
        })
