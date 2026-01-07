"""
URLs for Token Usage Monitoring API
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TokenUsageViewSet, DailyTokenSummaryViewSet, healthcheck

router = DefaultRouter()
router.register(r'token-usage', TokenUsageViewSet, basename='token-usage')
router.register(r'daily-summary', DailyTokenSummaryViewSet, basename='daily-summary')

urlpatterns = [
    path('health/', healthcheck),
    path('', include(router.urls)),
]
