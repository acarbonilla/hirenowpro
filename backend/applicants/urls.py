from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ApplicantViewSet, OfficeLocationViewSet

router = DefaultRouter()
router.register(r'applicants', ApplicantViewSet, basename='applicant')
router.register(r'offices', OfficeLocationViewSet, basename='office')

urlpatterns = [
    path('', include(router.urls)),
]
