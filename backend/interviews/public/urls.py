from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    PublicInterviewCreateView,
    PublicInterviewViewSet,
    PublicPositionTypeLookupView,
    PublicPositionTypeView,
    PublicPositionTypeViewSet,
    PublicJobPositionViewSet,
)

router = DefaultRouter()
router.register(r'position-types', PublicPositionTypeViewSet, basename='public-position-types')
router.register(r'positions', PublicJobPositionViewSet, basename='public-positions')
router.register(r'interviews', PublicInterviewViewSet, basename='public-interviews')

urlpatterns = [
    path("interviews/", PublicInterviewCreateView.as_view(), name="public-interview-create"),
    path("position-types/", PublicPositionTypeView.as_view(), name="public-position-types"),
]

urlpatterns += router.urls
