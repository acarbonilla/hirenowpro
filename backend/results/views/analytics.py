from datetime import timedelta

from django.db.models import Avg, Count, Q, F, DurationField, ExpressionWrapper
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from applicants.models import Applicant
from interviews.models import Interview
from results.models import InterviewResult


def _has_system_analytics_access(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True

    groups = set(user.groups.values_list("name", flat=True))
    if {"HR Manager", "Lead Recruiter", "System Owner"} & groups:
        return True

    role = getattr(user, "normalized_role", getattr(user, "role", None))
    return role in {"admin", "superadmin", "hr_manager"}


def _has_recruiter_insights_access(user) -> bool:
    if _has_system_analytics_access(user):
        return True
    groups = set(user.groups.values_list("name", flat=True))
    return "HR Recruiter" in groups


def _period_cutoff(period: str):
    if period in {"7d", "30d", "90d"}:
        days = int(period.replace("d", ""))
        return timezone.now() - timedelta(days=days)
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def recruiter_insights(request):
    user = request.user
    if not _has_recruiter_insights_access(user):
        return Response({"detail": "You do not have access to recruiter insights."}, status=403)

    now = timezone.now()
    pending_qs = InterviewResult.objects.filter(hr_decision__isnull=True)
    overdue_cutoff = now - timedelta(hours=48)

    avg_decision_delta = (
        InterviewResult.objects.filter(hr_decision_at__isnull=False)
        .annotate(
            decision_time=ExpressionWrapper(
                F("hr_decision_at") - F("result_date"),
                output_field=DurationField(),
            )
        )
        .aggregate(avg=Avg("decision_time"))
        .get("avg")
    )
    avg_decision_hours = round(avg_decision_delta.total_seconds() / 3600, 2) if avg_decision_delta else 0

    mismatch_count = InterviewResult.objects.filter(hr_decision__in=["hire", "reject"]).filter(
        Q(hr_decision="hire", passed=False) | Q(hr_decision="reject", passed=True)
    ).count()

    response = {
        "pending_reviews": pending_qs.count(),
        "overdue_reviews": pending_qs.filter(result_date__lt=overdue_cutoff).count(),
        "avg_hr_decision_time": avg_decision_hours,
        "interviews_waiting_today": pending_qs.filter(result_date__date=now.date()).count(),
        "interviews_waiting_week": pending_qs.filter(result_date__gte=now - timedelta(days=7)).count(),
        "ai_hr_mismatch_count": mismatch_count,
    }
    return Response(response)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def system_analytics(request):
    user = request.user
    if not _has_system_analytics_access(user):
        return Response({"detail": "You do not have access to system analytics."}, status=403)

    period = (request.query_params.get("period") or "30d").lower()
    cutoff = _period_cutoff(period)

    applicants_qs = Applicant.objects.all()
    interviews_qs = Interview.objects.all()
    results_qs = InterviewResult.objects.select_related("interview", "applicant")

    if cutoff:
        applicants_qs = applicants_qs.filter(application_date__gte=cutoff)
        interviews_qs = interviews_qs.filter(created_at__gte=cutoff)
        results_qs = results_qs.filter(result_date__gte=cutoff)

    total_applicants = applicants_qs.count()
    total_interviews = interviews_qs.count()
    total_results = results_qs.count()

    passed_count = results_qs.filter(passed=True).count()
    pass_rate = (passed_count / total_results * 100) if total_results else 0
    avg_score = results_qs.aggregate(avg=Avg("final_score")).get("avg") or 0

    status_breakdown = {
        row["status"]: row["count"]
        for row in applicants_qs.values("status").annotate(count=Count("id"))
    }

    position_breakdown = {
        row["position_type__code"]: row["count"]
        for row in interviews_qs.exclude(position_type__isnull=True)
        .values("position_type__code")
        .annotate(count=Count("id"))
    }

    scores_by_position = {
        row["interview__position_type__code"]: round(row["avg_score"] or 0, 2)
        for row in results_qs.exclude(interview__position_type__isnull=True)
        .values("interview__position_type__code")
        .annotate(avg_score=Avg("final_score"))
    }

    recent_cutoff = timezone.now() - timedelta(days=6)
    applicant_activity = {
        row["day"].isoformat(): row["count"]
        for row in applicants_qs.filter(application_date__gte=recent_cutoff)
        .annotate(day=TruncDate("application_date"))
        .values("day")
        .annotate(count=Count("id"))
    }
    interview_activity = {
        row["day"].isoformat(): row["count"]
        for row in interviews_qs.filter(created_at__gte=recent_cutoff)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(count=Count("id"))
    }
    result_activity = {
        row["day"].isoformat(): row["count"]
        for row in results_qs.filter(result_date__gte=recent_cutoff)
        .annotate(day=TruncDate("result_date"))
        .values("day")
        .annotate(count=Count("id"))
    }

    recent_activity = []
    for day_offset in range(6, -1, -1):
        date = (timezone.now() - timedelta(days=day_offset)).date()
        date_key = date.isoformat()
        recent_activity.append(
            {
                "date": date_key,
                "applicants": applicant_activity.get(date_key, 0),
                "interviews": interview_activity.get(date_key, 0),
                "results": result_activity.get(date_key, 0),
            }
        )

    score_distribution = []
    score_ranges = [
        ("0-20", 0, 20),
        ("21-40", 21, 40),
        ("41-60", 41, 60),
        ("61-80", 61, 80),
        ("81-100", 81, 100),
    ]
    for label, min_score, max_score in score_ranges:
        score_distribution.append(
            {
                "range": label,
                "count": results_qs.filter(final_score__gte=min_score, final_score__lte=max_score).count(),
            }
        )

    response = {
        "period": period,
        "total_applicants": total_applicants,
        "total_interviews": total_interviews,
        "total_results": total_results,
        "pass_rate": round(pass_rate, 2),
        "avg_score": round(avg_score, 2),
        "status_breakdown": status_breakdown,
        "position_breakdown": position_breakdown,
        "scores_by_position": scores_by_position,
        "recent_activity": recent_activity,
        "score_distribution": score_distribution,
        "funnel": {
            "applied": total_applicants,
            "interviewed": total_interviews,
            "passed": passed_count,
            "hired": applicants_qs.filter(status="hired").count(),
        },
    }
    return Response(response)
