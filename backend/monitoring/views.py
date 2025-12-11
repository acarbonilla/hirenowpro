"""
ViewSet for Token Usage Monitoring API
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Avg, Count, Q
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


class TokenUsageViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints for token usage monitoring
    
    Only HR Managers and IT Support can access this data
    """
    
    queryset = TokenUsage.objects.all()
    serializer_class = TokenUsageSerializer
    permission_classes = [RolePermission(required_roles=["HR_MANAGER", "IT_SUPPORT"])]
    
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
    permission_classes = [RolePermission(required_roles=["HR_MANAGER", "IT_SUPPORT"])]
