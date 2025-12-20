from datetime import datetime, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.exceptions import ValidationError

from common.permissions import IsHRUser
from results.models import InterviewResult, SystemSettings
from results.serializers import InterviewResultSummarySerializer


class HRResultSummaryPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 50
    allowed_sizes = {10, 20, 50}

    def get_page_size(self, request):
        size = super().get_page_size(request)
        if size is None:
            return self.page_size
        if size > self.max_page_size:
            raise ValidationError("page_size cannot exceed 50.")
        if size not in self.allowed_sizes:
            return self.page_size
        return size


class InterviewResultList(APIView):
    """
    SUMMARY ENDPOINT ONLY — do not add heavy fields here.
    This must stay lightweight for the HR list view.
    """

    permission_classes = [IsAuthenticated, IsHRUser]
    serializer_class = InterviewResultSummarySerializer
    pagination_class = HRResultSummaryPagination

    def get(self, request):
        paginator = self.pagination_class()

        date_filter = (request.query_params.get("date_filter") or "all").lower()
        status_filter = (request.query_params.get("status") or "").lower()
        outcome_filter = (request.query_params.get("outcome") or "").lower()
        include_older = (request.query_params.get("include_older") or "").lower() == "true"
        hr_decision_filter = (request.query_params.get("hr_decision") or "").lower()
        reviewed_since = (request.query_params.get("reviewed_since") or "").strip()
        include_stats = (request.query_params.get("include_stats") or "").lower() == "true"
        now = timezone.now()
        review_cutoff = now - timedelta(days=30)

        # Apply coarse date filters only on interview.created_at (indexed).
        # Arbitrary ranges are intentionally disallowed to prevent unbounded scans.
        date_filters = {
            "today": now.replace(hour=0, minute=0, second=0, microsecond=0),
            "week": (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0),
            "month": now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
        }

        qs = InterviewResult.objects.order_by("-result_date")

        # Intentional UX/perf boundary: Interview Review is a 30-day action queue.
        # Older interviews remain accessible via Interview Records.
        if not include_older:
            qs = qs.filter(result_date__gte=review_cutoff)

        if hr_decision_filter:
            if hr_decision_filter == "pending":
                qs = qs.filter(hr_decision__isnull=True)
            elif hr_decision_filter == "reviewed":
                qs = qs.filter(hr_decision__isnull=False)
            elif hr_decision_filter in {"hire", "reject", "hold"}:
                qs = qs.filter(hr_decision=hr_decision_filter)

        if reviewed_since:
            reviewed_date = parse_date(reviewed_since)
            if reviewed_date:
                reviewed_start = timezone.make_aware(datetime.combine(reviewed_date, datetime.min.time()))
                qs = qs.filter(hr_decision_at__gte=reviewed_start)

        if status_filter:
            qs = qs.filter(interview__status=status_filter)
        if outcome_filter in {"passed", "failed"}:
            qs = qs.filter(passed=(outcome_filter == "passed"))

        decision_filter = (request.query_params.get("final_decision") or "").lower()
        if decision_filter:
            if decision_filter == "pending":
                qs = qs.filter(final_decision__isnull=True)
            elif decision_filter in {"hired", "rejected"}:
                qs = qs.filter(final_decision=decision_filter)
            elif decision_filter in {"passed", "failed"}:
                qs = qs.filter(final_decision=("hired" if decision_filter == "passed" else "rejected"))
        if date_filter in date_filters:
            qs = qs.filter(interview__created_at__gte=date_filters[date_filter])

        # Fetch only summary fields; never include transcripts/analysis here.
        # Do not add applicant joins here — use denormalized display field.
        qs = (
            qs.values(
                "id",
                "applicant_display_name",
                "result_date",
                "final_score",
                "passed",
                "hr_decision",
                "hold_until",
                "final_decision",
                "interview__status",
                "interview__position_type__code",
            )
        )

        page = paginator.paginate_queryset(qs, request)
        serializer = self.serializer_class(
            [
                {
                    "id": item["id"],
                    "applicant_display_name": item.get("applicant_display_name", "") or "",
                    "created_at": item["result_date"],
                    "score": item["final_score"],
                    "passed": item["passed"],
                    "hr_decision": item.get("hr_decision"),
                    "hold_until": item.get("hold_until"),
                    "final_decision": item.get("final_decision"),
                    "interview_status": item.get("interview__status", ""),
                    "position_code": item.get("interview__position_type__code"),
                }
                for item in page
            ],
            many=True,
        )
        response = paginator.get_paginated_response(serializer.data)
        response.data["thresholds"] = {
            "passing": SystemSettings.get_passing_threshold(),
            "review": SystemSettings.get_review_threshold(),
        }
        if include_stats:
            pending_qs = InterviewResult.objects.order_by("-result_date")
            if not include_older:
                pending_qs = pending_qs.filter(result_date__gte=review_cutoff)
            pending_qs = pending_qs.filter(hr_decision__isnull=True)
            urgent_cutoff = now - timedelta(days=3)
            reviewed_today_start = timezone.make_aware(datetime.combine(now.date(), datetime.min.time()))
            reviewed_today_qs = InterviewResult.objects.order_by("-result_date").filter(
                hr_decision__isnull=False,
                hr_decision_at__gte=reviewed_today_start,
            )
            if not include_older:
                reviewed_today_qs = reviewed_today_qs.filter(result_date__gte=review_cutoff)
            response.data["stats"] = {
                "pending_count": pending_qs.count(),
                "urgent_count": pending_qs.filter(result_date__lte=urgent_cutoff).count(),
                "reviewed_today_count": reviewed_today_qs.count(),
            }
        return response
