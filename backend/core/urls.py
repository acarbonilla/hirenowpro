"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from core.api_public import public_router
from core.api_applicant import applicant_router
from core.api_hr import hr_router
from core.api_system import system_router

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API endpoints
    path('api/', include('accounts.urls')),
    path('api/', include('applicants.urls')),
    path('api/', include('interviews.urls')),
    path('api/public/', include('interviews.public.urls')),
    path('api/public/', include(public_router.urls)),
    path('api/applicant/', include(applicant_router.urls)),
    path('api/hr/', include(hr_router.urls)),
    path('api/hr/', include('hr.urls')),
    path('api/system/', include(system_router.urls)),
    path('api/', include('results.urls')),
    path('api/', include('monitoring.urls')),
    path('api/training/', include('training.urls')),
]

# Media files (for development only)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
