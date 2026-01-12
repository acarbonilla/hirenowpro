
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
    path('api/admin/', include('monitoring.admin_urls')),
    path('api/', include('results.urls')),
    path('api/', include('monitoring.urls')),
]

# Media files (for development only)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
