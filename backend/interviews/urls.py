from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    InterviewViewSet,
    InterviewQuestionViewSet,
    JobCategoryViewSet,
    QuestionTypeViewSet,
    JobPositionViewSet
)

router = DefaultRouter()
router.register(r'interviews', InterviewViewSet, basename='interview')
router.register(r'questions', InterviewQuestionViewSet, basename='question')
router.register(r'job-categories', JobCategoryViewSet, basename='job-category')
router.register(r'positions', JobPositionViewSet, basename='positions')
router.register(r'question-types', QuestionTypeViewSet, basename='question-type')

urlpatterns = [
    path('', include(router.urls)),
]
