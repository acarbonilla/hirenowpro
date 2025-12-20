from rest_framework.routers import DefaultRouter
from interviews.public.views import (
    PublicPositionTypeViewSet,
    PublicJobPositionViewSet,
)

public_router = DefaultRouter()
public_router.register(r'position-types', PublicPositionTypeViewSet, basename='public-position-types')
public_router.register(r'positions', PublicJobPositionViewSet, basename='public-positions')

urlpatterns = []
