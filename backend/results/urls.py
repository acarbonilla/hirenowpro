from django.urls import path, include
from rest_framework.routers import DefaultRouter
from results.views.base import InterviewResultViewSet, SystemSettingsViewSet
from results.views.analytics import recruiter_insights, system_analytics
from results.views.review_summary import InterviewReviewSummary
from results.views.review_details import InterviewReviewDetails
from results.views.results_list import InterviewResultList

router = DefaultRouter()
router.register(r'results', InterviewResultViewSet, basename='result')
router.register(r'settings', SystemSettingsViewSet, basename='settings')

urlpatterns = [
    path('', include(router.urls)),
    path('results/<int:pk>/review/summary/', InterviewReviewSummary.as_view(), name='result-review-summary'),
    path('results/<int:pk>/review/details/', InterviewReviewDetails.as_view(), name='result-review-details'),
    path('analytics/recruiter/', recruiter_insights, name='analytics-recruiter'),
    path('analytics/system/', system_analytics, name='analytics-system'),
]

from results.review_views.review_summary import InterviewReviewSummary
from results.review_views.review_details import InterviewReviewDetails

urlpatterns += [
    path("<int:pk>/review/summary/", InterviewReviewSummary.as_view()),
    path("<int:pk>/review/details/", InterviewReviewDetails.as_view()),
    path("results/summary/", InterviewResultList.as_view()),
    path("summary/", InterviewResultList.as_view()),
]
