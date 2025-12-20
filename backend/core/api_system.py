from rest_framework.routers import DefaultRouter
from monitoring.views import TokenUsageViewSet, DailyTokenSummaryViewSet

system_router = DefaultRouter()
system_router.register(r"token-usage", TokenUsageViewSet, basename="system-token-usage")
system_router.register(r"token-summary", DailyTokenSummaryViewSet, basename="system-token-summary")
