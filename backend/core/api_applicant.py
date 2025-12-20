from rest_framework.routers import DefaultRouter
from interviews.views import ApplicantInterviewViewSet
from applicants.views import ApplicantSelfViewSet

applicant_router = DefaultRouter()
applicant_router.register(r"interviews", ApplicantInterviewViewSet, basename="applicant-interviews")
applicant_router.register(r"profile", ApplicantSelfViewSet, basename="applicant-profile")
