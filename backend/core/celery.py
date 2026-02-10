import os
from celery import Celery

# Respect environment-provided Django settings module
# Fallback is safe for development only
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    os.getenv("DJANGO_SETTINGS_MODULE", "core.settings")
)

# Celery app name MUST match Django project
app = Celery("core")

# Load Celery config from Django settings (CELERY_ namespace)
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks from all INSTALLED_APPS
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print(f"Celery debug task executed. Request: {self.request!r}")
