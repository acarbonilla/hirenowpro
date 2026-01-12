"""
Admin-only monitoring endpoints.
"""

from django.urls import path
from .views import traffic_monitor

urlpatterns = [
    path("system/traffic-monitor/", traffic_monitor),
]
