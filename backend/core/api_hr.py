from rest_framework.routers import DefaultRouter
from interviews.views import InterviewViewSet, PositionTypeViewSet, JobPositionViewSet
from accounts.views import HRUserViewSet

hr_router = DefaultRouter()
hr_router.register(r"interviews", InterviewViewSet, basename="hr-interviews")
hr_router.register(r"position-types", PositionTypeViewSet, basename="hr-position-types")
hr_router.register(r"positions", JobPositionViewSet, basename="hr-positions")
hr_router.register(r"users", HRUserViewSet, basename="hr-users")
