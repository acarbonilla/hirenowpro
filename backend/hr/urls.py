from django.urls import include, path

from hr.views.dashboard import HRDashboardOverview

urlpatterns = [
    path("dashboard/overview/", HRDashboardOverview.as_view(), name="hr-dashboard-overview"),
    path("results/", include("results.urls")),
]
