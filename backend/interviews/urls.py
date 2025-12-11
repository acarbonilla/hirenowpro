from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    InterviewViewSet,
    InterviewQuestionViewSet,
    JobCategoryViewSet,
    QuestionTypeViewSet,
    JobPositionViewSet,
    PositionTypeViewSet,
)
from .magic_urls import (
    MagicLoginView,
    RefreshApplicantTokenView,
    HRResendInterviewLinkView,
    HRGenerateQRView,
    HRResendQRView,
    QRLoginView,
)

router = DefaultRouter()
router.register(r'interviews', InterviewViewSet, basename='interview')
router.register(r'questions', InterviewQuestionViewSet, basename='question')
router.register(r'job-categories', JobCategoryViewSet, basename='job-category')
router.register(r'positions', JobPositionViewSet, basename='positions')
router.register(r'question-types', QuestionTypeViewSet, basename='question-type')
router.register(r'position-types', PositionTypeViewSet, basename='position-type')

urlpatterns = [
    path('', include(router.urls)),
    path('applicant/magic-login/<str:token>/', MagicLoginView.as_view(), name='magic-login'),
    path('applicant/refresh-token/', RefreshApplicantTokenView.as_view(), name='refresh-applicant-token'),
    path('hr/applicant/<int:applicant_id>/resend-link/', HRResendInterviewLinkView.as_view(), name='hr-resend-link'),
    path('applicant/qr-login/<str:token>/', QRLoginView.as_view(), name='qr-login'),
    path('hr/applicant/<int:applicant_id>/generate-qr/', HRGenerateQRView.as_view(), name='hr-generate-qr'),
    path('hr/applicant/<int:applicant_id>/resend-qr/', HRResendQRView.as_view(), name='hr-resend-qr'),
]
