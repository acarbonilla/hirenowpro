from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.utils.timezone import now
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from applicants.models import Applicant
from interviews.models import Interview
from results.models import InterviewResult
from common.permissions import IsHRUser


class HRDashboardOverview(APIView):
    """
    Lightweight overview for HR dashboard.
    Uses Django permissions (IsHRUser) for access control.
    """

    permission_classes = [IsAuthenticated, IsHRUser]

    def get(self, request):
        today = now().date()
        seven_days_ago = today - timedelta(days=7)
        thirty_days_ago = today - timedelta(days=30)

        total_applicants = Applicant.objects.count()
        total_interviews = Interview.objects.count()

        # Only pull fields needed for aggregates
        results_qs = InterviewResult.objects.only("passed", "final_score", "result_date", "final_decision")
        results_stats = results_qs.aggregate(
            total=Count("id"),
            passes=Count("id", filter=Q(passed=True)),
            avg_score=Avg("final_score"),
        )

        pending_reviews = results_qs.filter(final_decision__isnull=True).count()
        completed_today = results_qs.filter(result_date__date=today).count()
        completed_7d = results_qs.filter(result_date__date__gte=seven_days_ago).count()
        completed_30d = results_qs.filter(result_date__date__gte=thirty_days_ago).count()

        in_progress_interviews = Interview.objects.filter(
            status__in=["submitted", "processing", "in_progress"]
        ).count()
        failed_interviews = Interview.objects.filter(status="failed").count()

        new_applicants_7d = Applicant.objects.filter(application_date__date__gte=seven_days_ago).count()
        new_applicants_30d = Applicant.objects.filter(application_date__date__gte=thirty_days_ago).count()

        total_results = results_stats["total"] or 0
        pass_rate = (results_stats["passes"] or 0) / total_results * 100 if total_results else 0

        recent_interviews = (
            Interview.objects.select_related("applicant", "result")
            .only("id", "status", "created_at", "applicant__first_name", "applicant__last_name", "result__final_score", "result__passed")
            .order_by("-created_at")[:5]
        )
        recent_payload = []
        for interview in recent_interviews:
            applicant = interview.applicant
            result = getattr(interview, "result", None)
            recent_payload.append(
                {
                    "id": interview.id,
                    "applicant": {
                        "id": applicant.id if applicant else None,
                        "full_name": applicant.full_name if applicant else None,
                    },
                    "status": interview.status,
                    "created_at": interview.created_at,
                    "result": {
                        "id": result.id if result else None,
                        "passed": result.passed if result else None,
                        "final_score": result.final_score if result else None,
                    }
                    if result
                    else None,
                }
            )

        payload = {
            "total_applicants": total_applicants,
            "total_interviews": total_interviews,
            "pending_reviews": pending_reviews,
            "completed_today": completed_today,
            "pass_rate": round(pass_rate, 1),
            "avg_score": round(results_stats["avg_score"] or 0, 1),
            "recent_interviews": recent_payload,
            # Additional context if needed later
            "meta": {
                "completed_last_7_days": completed_7d,
                "completed_last_30_days": completed_30d,
                "in_progress": in_progress_interviews,
                "failed": failed_interviews,
                "new_applicants_7d": new_applicants_7d,
                "new_applicants_30d": new_applicants_30d,
                "total_results": total_results,
            },
        }

        return Response(payload)
