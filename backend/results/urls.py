from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InterviewResultViewSet, SystemSettingsViewSet

router = DefaultRouter()
router.register(r'results', InterviewResultViewSet, basename='result')
router.register(r'settings', SystemSettingsViewSet, basename='settings')

urlpatterns = [
    path('', include(router.urls)),
]
