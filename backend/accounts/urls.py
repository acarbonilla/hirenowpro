"""
URL patterns for accounts app
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    LoginView,
    LoginView as HRLoginView,
    LoginView as ApplicantLoginView,
    LogoutView,
    RegisterView,
    UserProfileView,
    ChangePasswordView,
    check_auth
)

app_name = 'accounts'

urlpatterns = [
    # Authentication
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/hr-login/', HRLoginView.as_view(allowed_roles=["hr", "admin", "superadmin"]), name='hr_login'),
    path('auth/applicant-login/', ApplicantLoginView.as_view(allowed_roles=["applicant"]), name='applicant_login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/check/', check_auth, name='check_auth'),
    
    # User profile
    path('auth/profile/', UserProfileView.as_view(), name='profile'),
    path('auth/change-password/', ChangePasswordView.as_view(), name='change_password'),
]
