
from pathlib import Path
import os
import secrets
import logging
from dotenv import load_dotenv
from corsheaders.defaults import default_headers

# Load environment variables
load_dotenv()
logger = logging.getLogger(__name__)

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
ENV = (os.getenv("ENV") or ("development" if DEBUG else "production")).strip().lower()
IS_PROD = ENV == "production"
IS_DEV = ENV in ("development", "dev")
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or os.getenv("SECRET_KEY")
if not SECRET_KEY and DEBUG:
    SECRET_KEY = secrets.token_urlsafe(50)
if not SECRET_KEY and not DEBUG:
    raise RuntimeError("DJANGO_SECRET_KEY must be set in production")

# ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
ALLOWED_HOSTS = [
    h.strip()
    for h in os.getenv("ALLOWED_HOSTS", "").split(",")
    if h.strip()
]
# Trust proxy headers (Nginx → Gunicorn)
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third-party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',  # For logout token blacklisting
    'corsheaders',
    'django_redis',
    
    # Custom apps
    'accounts',
    'applicants',
    'interviews',
    'processing',
    'notifications',
    'results',
    'monitoring',
    
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # CORS middleware
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': os.getenv('DB_ENGINE', 'django.db.backends.postgresql'),
        'NAME': os.getenv('DB_NAME', 'hirenowpro_db'),
        'USER': os.getenv('DB_USER', 'postgres'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
    }
}


# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Manila'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = 'static/'

STATIC_ROOT = os.getenv("STATIC_ROOT")

if 'collectstatic' in os.sys.argv:
    if not STATIC_ROOT:
        raise RuntimeError(
            "STATIC_ROOT must be set via environment variable for production collectstatic"
        )


# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ============================
# REST FRAMEWORK CONFIGURATION
# ============================

def _get_rate(env_key: str, default_rate: str) -> str:
    value = os.getenv(env_key)
    return value.strip() if value else default_rate


PUBLIC_INTERVIEW_UPLOAD_RATE = _get_rate(
    "PUBLIC_INTERVIEW_UPLOAD_RATE",
    "30/min" if IS_PROD else "300/min",
)
PUBLIC_INTERVIEW_SUBMIT_RATE = _get_rate(
    "PUBLIC_INTERVIEW_SUBMIT_RATE",
    "10/min" if IS_PROD else "100/min",
)
PUBLIC_INTERVIEW_TTS_RATE = _get_rate(
    "PUBLIC_INTERVIEW_TTS_RATE",
    "20/min" if IS_PROD else "200/min",
)
PUBLIC_INTERVIEW_RETRIEVE_RATE = _get_rate(
    "PUBLIC_INTERVIEW_RETRIEVE_RATE",
    "120/min" if IS_PROD else "1200/min",
)
PUBLIC_INTERVIEW_UPLOAD_BURST_RATE = _get_rate(
    "PUBLIC_INTERVIEW_UPLOAD_BURST_RATE",
    "60/min" if IS_PROD else "600/min",
)
PUBLIC_INTERVIEW_UPLOAD_SUSTAINED_RATE = _get_rate(
    "PUBLIC_INTERVIEW_UPLOAD_SUSTAINED_RATE",
    "600/hour" if IS_PROD else "6000/hour",
)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,

    'DEFAULT_THROTTLE_RATES': {
    # Interview
    'public_interview_retrieve': PUBLIC_INTERVIEW_RETRIEVE_RATE,
    'public_interview_submit': PUBLIC_INTERVIEW_SUBMIT_RATE,
    'public_interview_tts': PUBLIC_INTERVIEW_TTS_RATE,
    'public_interview_upload': PUBLIC_INTERVIEW_UPLOAD_RATE,
    'public_interview_upload_burst': PUBLIC_INTERVIEW_UPLOAD_BURST_RATE,
    'public_interview_upload_sustained': PUBLIC_INTERVIEW_UPLOAD_SUSTAINED_RATE,

    # Registration
    'registration_burst': '50/min',
    'registration_hourly': '200/hour',
    'registration_daily': '500/day',

    # Login
    'login_ip': '10/min',
    'login_user': '10/min',
},

}

if DEBUG:
    REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].update(
        {
            "registration_burst": "50/min",
            "registration_hourly": "200/hour",
            "registration_daily": "500/day",
        }
    )


# ============================
# JWT CONFIGURATION
# ============================

from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}


# ============================
# CORS CONFIGURATION
# ============================

CORS_ALLOW_CREDENTIALS = True

if DEBUG:
    # Development: allow everything (safe locally)
    CORS_ALLOW_ALL_ORIGINS = True
else:
    # Production: strict allowlist
    CORS_ALLOWED_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]

CORS_ALLOW_HEADERS = list(default_headers) + [
    "authorization",
    "x-portal",
    "x-upload-attempt",
    "x-upload-trigger",
    "x-upload-no-retry",
]





# ============================
# REDIS & CACHING CONFIGURATION
# ============================

REDIS_HOST = os.getenv("REDIS_HOST", "redis" if not DEBUG else "localhost")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_DB = os.getenv("REDIS_DB", "0")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}



# ============================
# CELERY CONFIGURATION
# ============================
CELERY_BROKER_URL = os.getenv(
    "CELERY_BROKER_URL",
    "redis://127.0.0.1:6379/0"
)

CELERY_RESULT_BACKEND = os.getenv(
    "CELERY_RESULT_BACKEND",
    "redis://127.0.0.1:6379/1"
)


CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_WORKER_PREFETCH_MULTIPLIER = int(os.getenv('CELERY_WORKER_PREFETCH_MULTIPLIER', '1'))
CELERY_TASK_ACKS_LATE = os.getenv('CELERY_TASK_ACKS_LATE', 'True') == 'True'
CELERY_TASK_TIME_LIMIT = int(os.getenv('CELERY_TASK_TIME_LIMIT', '900'))  # hard limit in seconds
CELERY_TASK_SOFT_TIME_LIMIT = int(os.getenv('CELERY_TASK_SOFT_TIME_LIMIT', '840'))
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_TASK_TRACK_STARTED = True
# Ensure broker re-delivery timeout exceeds max task duration.
CELERY_BROKER_TRANSPORT_OPTIONS = {"visibility_timeout": 1200}
CELERY_RESULT_EXPIRES = int(os.getenv('CELERY_RESULT_EXPIRES', '3600'))


# ============================
# EMAIL (SMTP) CONFIGURATION
# ============================

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'no-reply@hirenowpro.local')


# ============================
# AI CONFIGURATION
# ============================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_TTS_MODEL = os.getenv("DEEPGRAM_TTS_MODEL", "aura-2-thalia-en")
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "deepgram")
STT_PROVIDER = os.getenv("STT_PROVIDER", "deepgram")

TTS_ENABLED = bool(DEEPGRAM_API_KEY and TTS_PROVIDER == "deepgram")
STT_ENABLED = bool(DEEPGRAM_API_KEY and STT_PROVIDER == "deepgram")

INTERVIEW_PROCESSING_SYNC = os.getenv("INTERVIEW_PROCESSING_SYNC", "false").lower() == "true"
if not DEBUG:
    INTERVIEW_PROCESSING_SYNC = False

logger.info("TTS enabled: %s", TTS_ENABLED)
logger.info("TTS provider: %s", TTS_PROVIDER)
logger.info("TTS model: %s", DEEPGRAM_TTS_MODEL)
logger.info("STT enabled: %s", STT_ENABLED)
logger.info("Interview processing sync enabled: %s", INTERVIEW_PROCESSING_SYNC)



# ============================
# CUSTOM USER MODEL
# ============================

AUTH_USER_MODEL = 'accounts.User'

# Applicant token settings
APPLICANT_SECRET = os.getenv("APPLICANT_SECRET")
if not APPLICANT_SECRET and not IS_PROD:
    APPLICANT_SECRET = secrets.token_urlsafe(32)
if not APPLICANT_SECRET and IS_PROD:
    raise RuntimeError("APPLICANT_SECRET must be set in production")
APPLICANT_TOKEN_EXPIRY_HOURS = int(os.getenv("APPLICANT_TOKEN_EXPIRY_HOURS", "12"))
INTERVIEW_TOKEN_EXPIRY_HOURS = int(os.getenv("INTERVIEW_TOKEN_EXPIRY_HOURS", "48"))

# Debug flags
LOG_HR_AUTH = False

# ============================
# MEDIA FILES (for video uploads, documents)
# ============================

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]

if not DEBUG:
    CSRF_COOKIE_SAMESITE = "None"
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "None"
    SESSION_COOKIE_SECURE = True

    if not CORS_ALLOWED_ORIGINS:
        logger.warning("CORS_ALLOWED_ORIGINS is empty in production")
    if not CSRF_TRUSTED_ORIGINS:
        logger.warning("CSRF_TRUSTED_ORIGINS is empty in production")


# This is for testing for production level
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
}

