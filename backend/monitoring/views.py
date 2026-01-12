"""
ViewSet for Token Usage Monitoring API
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Sum, Avg, Count, Q
from django.db import connections
from django.core.cache import cache
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from .models import TokenUsage, DailyTokenSummary
from .serializers import (
    TokenUsageSerializer,
    DailyTokenSummarySerializer,
    TokenUsageStatsSerializer
)
from accounts.permissions import RolePermission

GUARD_HIT_CACHE_KEY = "traffic_monitor:idempotency_guard_hits:last_1h"
RETRY_COUNT_CACHE_KEY = "traffic_monitor:retry_attempts:last_15m"


def _provider_name(model_name: str | None) -> str:
    if not model_name:
        return "Other"
    normalized = model_name.lower()
    if "deepgram" in normalized:
        return "Deepgram"
    if "gemini" in normalized:
        return "Gemini"
    return "Other"


def _safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


@api_view(["GET"])
@permission_classes([IsAuthenticated, RolePermission])
def traffic_monitor(request):
    traffic_monitor.required_user_types = ["IT_SUPPORT", "ADMIN", "SUPERADMIN"]
    """
    Read-only system traffic monitor for async amplification signals.
    Returns partial data if some metrics are unavailable.
    """
    now = timezone.now()
    window_15m = now - timedelta(minutes=15)
    window_1h = now - timedelta(hours=1)
    data_quality_notes = []

    active_workers = None
    queue_depth = {"pending": None, "active": None, "retried": None}
    try:
        from core.celery import app as celery_app

        inspector = celery_app.control.inspect(timeout=1)
        active = inspector.active() or {}
        reserved = inspector.reserved() or {}
        scheduled = inspector.scheduled() or {}
        stats = inspector.stats() or {}

        active_count = sum(len(tasks) for tasks in active.values())
        pending_count = sum(len(tasks) for tasks in reserved.values()) + sum(len(tasks) for tasks in scheduled.values())

        active_workers = len(stats)
        queue_depth = {"pending": pending_count, "active": active_count, "retried": None}
    except Exception:
        data_quality_notes.append("celery_inspect_unavailable")

    # Task error rate based on ProcessingQueue outcomes (best-effort)
    try:
        from processing.models import ProcessingQueue

        outcome_stats = ProcessingQueue.objects.filter(
            completed_at__gte=window_15m
        ).aggregate(
            total=Count("id"),
            failed=Count("id", filter=Q(status="failed")),
        )
        total_tasks_15m = _safe_int(outcome_stats.get("total"))
        failed_tasks_15m = _safe_int(outcome_stats.get("failed"))
        task_error_rate_last_15m = (failed_tasks_15m / total_tasks_15m) if total_tasks_15m else 0.0
    except Exception:
        total_tasks_15m = 0
        task_error_rate_last_15m = 0.0
        data_quality_notes.append("processing_queue_unavailable")

    # Outbound call volume (TokenUsage)
    try:
        outbound_calls_last_15m = TokenUsage.objects.filter(created_at__gte=window_15m).count()
    except Exception:
        outbound_calls_last_15m = 0
        data_quality_notes.append("token_usage_unavailable")

    worker_restarts_last_1h = None
    data_quality_notes.append("worker_restart_detection_unavailable")

    # Traffic amplification metrics
    avg_tasks_per_interview = 0.0
    max_tasks_for_single_interview = 0
    avg_retries_per_task = 0.0
    outbound_calls_per_interview = 0.0
    idempotency_guard_hits = 0

    try:
        from processing.models import ProcessingQueue

        per_interview = ProcessingQueue.objects.filter(created_at__gte=window_1h).values("interview_id").annotate(
            count=Count("id")
        )
        counts = [row["count"] for row in per_interview]
        if counts:
            avg_tasks_per_interview = sum(counts) / len(counts)
            max_tasks_for_single_interview = max(counts)
    except Exception:
        data_quality_notes.append("processing_queue_metrics_unavailable")

    try:
        idempotency_guard_hits = _safe_int(cache.get(GUARD_HIT_CACHE_KEY, 0))
    except Exception:
        data_quality_notes.append("guard_hit_cache_unavailable")

    try:
        retry_attempts = _safe_int(cache.get(RETRY_COUNT_CACHE_KEY, 0))
        avg_retries_per_task = (retry_attempts / total_tasks_15m) if total_tasks_15m else 0.0
    except Exception:
        data_quality_notes.append("retry_cache_unavailable")

    try:
        outbound_qs = TokenUsage.objects.filter(created_at__gte=window_1h, interview__isnull=False)
        outbound_calls = outbound_qs.count()
        interviews_seen = outbound_qs.values("interview_id").distinct().count()
        outbound_calls_per_interview = (outbound_calls / interviews_seen) if interviews_seen else 0.0
    except Exception:
        data_quality_notes.append("outbound_calls_per_interview_unavailable")

    # Recent async activity (best-effort: ProcessingQueue)
    recent_activity = []
    try:
        from processing.models import ProcessingQueue

        recent_entries = (
            ProcessingQueue.objects.select_related("interview")
            .order_by("-created_at")[:25]
        )
        for entry in recent_entries:
            if entry.started_at and entry.completed_at:
                duration_seconds = (entry.completed_at - entry.started_at).total_seconds()
            else:
                duration_seconds = None
            task_name = "interviews.tasks.process_complete_interview"
            if entry.processing_type == "single_video":
                task_name = "interviews.tasks.analyze_single_video"
            recent_activity.append(
                {
                    "timestamp": entry.created_at.isoformat(),
                    "interview_id": entry.interview_id,
                    "task_name": task_name,
                    "state": entry.status.upper(),
                    "retries": None,
                    "duration_seconds": duration_seconds,
                    "worker_id": None,
                    "exited_via_idempotency_guard": False,
                }
            )
    except Exception:
        data_quality_notes.append("recent_activity_unavailable")

    # Outbound API summary (best-effort)
    outbound_api_summary = []
    try:
        usage_rows = TokenUsage.objects.filter(created_at__gte=window_15m).values(
            "model_name", "success", "api_response_time"
        )
        provider_stats = {}
        for row in usage_rows:
            provider = _provider_name(row.get("model_name"))
            bucket = provider_stats.setdefault(
                provider,
                {"calls": 0, "errors": 0, "retry_count": 0, "total_latency_ms": 0.0},
            )
            bucket["calls"] += 1
            if not row.get("success", True):
                bucket["errors"] += 1
                bucket["retry_count"] += 1  # best-effort: failed calls indicate retry pressure
            latency = _safe_float(row.get("api_response_time"))
            if latency:
                bucket["total_latency_ms"] += latency * 1000
        for provider, stats in provider_stats.items():
            avg_latency = (stats["total_latency_ms"] / stats["calls"]) if stats["calls"] else 0.0
            outbound_api_summary.append(
                {
                    "provider": provider,
                    "calls_last_15m": stats["calls"],
                    "error_count": stats["errors"],
                    "retry_count": stats["retry_count"],
                    "avg_latency_ms": round(avg_latency, 2),
                }
            )
    except Exception:
        data_quality_notes.append("outbound_api_summary_unavailable")

    # Risk signals
    worker_online_but_not_executing = False
    if active_workers is not None and queue_depth.get("pending") is not None and queue_depth.get("active") is not None:
        worker_online_but_not_executing = (
            active_workers > 0 and queue_depth["pending"] > 0 and queue_depth["active"] == 0
        )

    repeated_worker_restart_detected = False
    log_write_failures_detected = False
    task_retries_spiking = avg_retries_per_task >= 1.0 and total_tasks_15m >= 5

    outbound_calls_spiking = False
    try:
        previous_window = now - timedelta(minutes=30)
        previous_calls = TokenUsage.objects.filter(
            created_at__gte=previous_window, created_at__lt=window_15m
        ).count()
        if outbound_calls_last_15m >= 50 and outbound_calls_last_15m > (previous_calls * 2):
            outbound_calls_spiking = True
    except Exception:
        data_quality_notes.append("outbound_spike_detection_unavailable")

    flags = [
        worker_online_but_not_executing,
        repeated_worker_restart_detected,
        log_write_failures_detected,
        task_retries_spiking,
        outbound_calls_spiking,
    ]
    infrastructure_risk_level = "HIGH" if sum(bool(flag) for flag in flags) >= 2 else "NORMAL"

    payload = {
        "generated_at": now.isoformat(),
        "data_quality_notes": data_quality_notes,
        "global_health_summary": {
            "active_celery_workers": active_workers,
            "celery_queue_depth": queue_depth,
            "task_error_rate_last_15m": round(task_error_rate_last_15m, 4),
            "outbound_calls_last_15m": outbound_calls_last_15m,
            "worker_restarts_last_1h": worker_restarts_last_1h,
        },
        "traffic_amplification_metrics": {
            "avg_tasks_per_interview_last_1h": round(avg_tasks_per_interview, 2),
            "max_tasks_for_single_interview_last_1h": max_tasks_for_single_interview,
            "avg_retries_per_task_last_15m": round(avg_retries_per_task, 2),
            "outbound_calls_per_interview_last_1h": round(outbound_calls_per_interview, 2),
            "idempotency_guard_hits_last_1h": idempotency_guard_hits,
        },
        "recent_async_activity": recent_activity,
        "outbound_api_summary": outbound_api_summary,
        "provider_risk_signals": {
            "worker_online_but_not_executing": worker_online_but_not_executing,
            "repeated_worker_restart_detected": repeated_worker_restart_detected,
            "log_write_failures_detected": log_write_failures_detected,
            "task_retries_spiking": task_retries_spiking,
            "outbound_calls_spiking": outbound_calls_spiking,
            "infrastructure_risk_level": infrastructure_risk_level,
        },
    }
    return Response(payload)


@api_view(["GET"])
@permission_classes([AllowAny])
def healthcheck(request):
    db_ok = True
    redis_ok = True
    db_error = ""
    redis_error = ""

    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception as exc:
        db_ok = False
        db_error = str(exc)

    try:
        cache_key = "healthcheck"
        cache.set(cache_key, "ok", timeout=5)
        redis_ok = cache.get(cache_key) == "ok"
        if not redis_ok:
            redis_error = "cache read/write mismatch"
    except Exception as exc:
        redis_ok = False
        redis_error = str(exc)

    status_code = status.HTTP_200_OK if db_ok and redis_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    payload = {
        "status": "ok" if status_code == status.HTTP_200_OK else "degraded",
        "db": "ok" if db_ok else "error",
        "redis": "ok" if redis_ok else "error",
        "db_error": db_error,
        "redis_error": redis_error,
        "timestamp": timezone.now().isoformat(),
    }
    return Response(payload, status=status_code)


class TokenUsageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for token usage monitoring
    
    Only HR Managers and IT Support can access this data
    """
    
    queryset = TokenUsage.objects.all()
    serializer_class = TokenUsageSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    required_user_types = ["HR_MANAGER", "IT_SUPPORT"]
    
    def get_queryset(self):
        """Filter based on query parameters"""
        queryset = super().get_queryset()
        
        # Filter by operation type
        operation_type = self.request.query_params.get('operation_type')
        if operation_type:
            queryset = queryset.filter(operation_type=operation_type)
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        # Filter by interview
        interview_id = self.request.query_params.get('interview_id')
        if interview_id:
            queryset = queryset.filter(interview_id=interview_id)
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """
        Get overall token usage statistics
        
        GET /api/token-usage/statistics/
        """
        now = timezone.now()
        today = now.date()
        month_start = today.replace(day=1)
        
        # Overall totals
        total_stats = TokenUsage.objects.aggregate(
            total_requests=Count('id'),
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('estimated_cost'),
            avg_response_time=Avg('api_response_time'),
            successful=Count('id', filter=Q(success=True))
        )
        
        # Today's stats
        today_stats = TokenUsage.objects.filter(
            created_at__date=today
        ).aggregate(
            today_requests=Count('id'),
            today_tokens=Sum('total_tokens'),
            today_cost=Sum('estimated_cost')
        )
        
        # This month's stats
        month_stats = TokenUsage.objects.filter(
            created_at__date__gte=month_start
        ).aggregate(
            month_requests=Count('id'),
            month_tokens=Sum('total_tokens'),
            month_cost=Sum('estimated_cost')
        )
        
        # Averages by operation type
        transcription_avg = TokenUsage.objects.filter(
            operation_type='transcription'
        ).aggregate(avg=Avg('total_tokens'))['avg'] or 0
        
        analysis_avg = TokenUsage.objects.filter(
            operation_type__in=['analysis', 'batch_analysis']
        ).aggregate(avg=Avg('total_tokens'))['avg'] or 0
        
        # Average cost per interview (sum of all operations for one interview)
        from interviews.models import Interview
        interview_costs = []
        recent_interviews = Interview.objects.filter(
            status='completed',
            completed_at__gte=now - timedelta(days=30)
        )[:100]
        
        for interview in recent_interviews:
            cost = TokenUsage.objects.filter(
                interview=interview
            ).aggregate(total=Sum('estimated_cost'))['total'] or 0
            if cost > 0:
                interview_costs.append(float(cost))
        
        avg_cost_per_interview = sum(interview_costs) / len(interview_costs) if interview_costs else 0
        
        # Success rate
        total_requests = total_stats['total_requests'] or 1
        successful_requests = total_stats['successful'] or 0
        success_rate = (successful_requests / total_requests) * 100 if total_requests > 0 else 100
        
        stats = {
            'total_requests': total_stats['total_requests'] or 0,
            'total_tokens': total_stats['total_tokens'] or 0,
            'total_cost': total_stats['total_cost'] or Decimal('0.00'),
            
            'today_requests': today_stats['today_requests'] or 0,
            'today_tokens': today_stats['today_tokens'] or 0,
            'today_cost': today_stats['today_cost'] or Decimal('0.00'),
            
            'this_month_requests': month_stats['month_requests'] or 0,
            'this_month_tokens': month_stats['month_tokens'] or 0,
            'this_month_cost': month_stats['month_cost'] or Decimal('0.00'),
            
            'avg_tokens_per_transcription': round(transcription_avg, 2),
            'avg_tokens_per_analysis': round(analysis_avg, 2),
            'avg_cost_per_interview': round(Decimal(str(avg_cost_per_interview)), 2),
            
            'success_rate': round(success_rate, 2),
            'avg_response_time': round(total_stats['avg_response_time'] or 0, 2)
        }
        
        serializer = TokenUsageStatsSerializer(stats)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def daily_summary(self, request):
        """
        Get daily token usage summary
        
        GET /api/token-usage/daily-summary/?days=30
        """
        days = int(request.query_params.get('days', 30))
        
        summaries = DailyTokenSummary.objects.all()[:days]
        serializer = DailyTokenSummarySerializer(summaries, many=True)
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='by-operation')
    def by_operation(self, request):
        """
        Get token usage breakdown by operation type
        
        GET /api/token-usage/by-operation/
        """
        operation_stats = TokenUsage.objects.values('operation_type').annotate(
            count=Count('id'),
            total_tokens=Sum('total_tokens'),
            total_cost=Sum('estimated_cost'),
            avg_tokens=Avg('total_tokens'),
            avg_response_time=Avg('api_response_time')
        ).order_by('-total_tokens')
        
        return Response(operation_stats)


class DailyTokenSummaryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for daily token summaries
    
    Only HR Managers and IT Support can access
    """
    
    queryset = DailyTokenSummary.objects.all()
    serializer_class = DailyTokenSummarySerializer
    permission_classes = [IsAuthenticated, RolePermission]
    required_user_types = ["HR_MANAGER", "IT_SUPPORT"]
