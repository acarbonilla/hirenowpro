# HireNowPro - Backend Setup Documentation

## Project Overview

HireNowPro is an AI-powered recruitment system that automates the initial interview process using video responses, AI analysis (LangChain + Gemini 2.5 Flash), and automated applicant screening.

## Technology Stack

### Backend Technologies

- **Framework**: Django 5.1.3
- **API**: Django REST Framework 3.15.2
- **Authentication**: JWT (djangorestframework-simplejwt 5.3.1)
- **Database**: PostgreSQL (psycopg2-binary 2.9.10)
- **Task Queue**: Celery 5.4.0
- **Cache/Broker**: Redis 5.2.0
- **AI/ML Stack**:
  - LangChain 0.3.7
  - LangGraph 0.2.45
  - LangChain-Google-GenAI 2.0.5
  - Google Generative AI 0.8.3
- **Video Processing**: OpenCV 4.10.0.84
- **Image Processing**: Pillow 11.0.0

### Frontend Technologies (Planned)

- Next.js
- Tailwind CSS

---

## System Architecture

### Application Flow

```
1. Walk-in Applicant → Recruiter Intake Portal
2. Online Applicant → Website Web Form
3. Both → Reapplication Verification
4. → AI Initial Interview (Video Response)
5. → AI/ML Analysis (LangChain, RAG, etc.)
6. → Processing Queue (10 min async)
7. → Result: Pass/Fail
8. Pass → HR Portal + Email Notification (Walk-in)
9. Fail → Applicant waits 2-3 weeks before reapply
```

### Initial Interview (Competency Screening)
- Purpose: broad competency fit (communication, customer handling, problem explanation) with light category alignment (e.g., troubleshooting for IT Support).
- Routing: questions are selected by controlled competencies, not free-text tags/subroles.
- Safety: sales/upselling items are only eligible for Sales/Customer Service categories.
- Deep technical validation is deferred to later interview stages/modules.

---

## Database Structure

### Django Apps & Models

#### 1. **accounts** (User Management)

**Tables:**

- `User` (Custom user extending AbstractUser)
  - Fields: username, email, password, user_type (recruiter/hr_admin/system_admin)
  - Custom user model: `AUTH_USER_MODEL = 'accounts.User'`
- `RecruiterProfile`
  - Fields: user (FK), department, employee_id, portal_access_level
  - One-to-one relationship with User

#### 2. **applicants** (Applicant Management)

**Tables:**

- `Applicant`
  - Fields: first_name, last_name, email, phone, application_source (walk_in/online)
  - Status: pending, in_review, passed, failed
  - Tracks: application_date, reapplication_date
- `ApplicantDocument`
  - Fields: applicant (FK), document_type (resume/cover_letter/id/certificate)
  - File storage: `applicant_documents/%Y/%m/%d/`

#### 3. **interviews** (AI Interview System)

**Tables:**

- `InterviewQuestion`

  - Fields: question_text, question_type (technical/behavioral/situational)
  - Managed: is_active, order

- `Interview`

  - Fields: applicant (FK), interview_type (initial_ai/technical/final)
  - Status: pending, in_progress, completed, failed
  - Timestamps: created_at, completed_at

- `VideoResponse`

  - Fields: interview (FK), question (FK), video_file_path, duration
  - Processing flag: processed (boolean)
  - File storage: `video_responses/%Y/%m/%d/`

- `AIAnalysis` (One-to-one with VideoResponse)
  - Fields: transcript_text, sentiment_score, confidence_score
  - Analysis data: body_language_analysis (JSON), speech_clarity_score
  - Scores: content_relevance_score, overall_score
  - AI recommendation: pass/fail/review
  - Raw data: langchain_analysis_data (JSON)

#### 4. **processing** (Async Processing)

**Tables:**

- `ProcessingQueue`

  - Fields: interview (One-to-one), status (queued/processing/completed/failed)
  - Celery tracking: celery_task_id, error_message
  - Timestamps: queued_at, started_at, completed_at

- `ProcessingLog`
  - Fields: queue_item (FK), log_level (debug/info/warning/error/critical)
  - Content: message, timestamp

#### 5. **notifications** (Email & Notifications)

**Tables:**

- `EmailTemplate`

  - Fields: template_name, template_type, subject
  - Content: body_html, body_text
  - Types: application_received, interview_passed/failed, reapplication_allowed

- `Notification`
  - Fields: applicant (FK), notification_type (email/sms/push)
  - Status: pending, sent, failed
  - Content: message_content, delivery_status
  - Timestamp: sent_at, created_at

#### 6. **results** (Results & Reporting)

**Tables:**

- `InterviewResult`

  - Fields: interview (One-to-one), applicant (FK), final_score, passed
  - Tracking: hr_portal_displayed, email_notification_sent
  - Timestamp: result_date

- `ReapplicationTracking`
  - Fields: applicant (One-to-one), last_application_date, can_reapply_after
  - Counter: reapplication_count
  - Property: is_eligible_to_reapply (computed from date)

---

## Project Setup Steps Completed

### 1. Virtual Environment Setup

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 2. Dependencies Installation

Created `requirements.txt` with all necessary packages and installed:

```powershell
pip install -r requirements.txt
```

### 3. Django Project Creation

- Project name: `core`
- Location: `backend/`
- Structure created with manage.py and core app

### 4. Environment Configuration

Created `.env` file with:

- Django settings (SECRET_KEY, DEBUG, ALLOWED_HOSTS)
- PostgreSQL configuration
- Redis configuration
- Celery configuration
- Gemini API key

### 5. Django Settings Configuration

Updated `core/settings.py`:

- Loaded environment variables with python-dotenv
- Configured PostgreSQL database
- Added REST Framework settings
- Configured JWT authentication
- Set up CORS for Next.js frontend
- Configured Redis caching
- Set up Celery configuration
- Added custom user model: `AUTH_USER_MODEL = 'accounts.User'`
- Configured media files for uploads

### 6. Celery Configuration

Created `core/celery.py`:

- Celery app initialization
- Redis as broker and result backend
- Auto-discovery of tasks from all apps
- Updated `core/__init__.py` to import celery app

### 7. Django Apps Creation

Created 6 Django apps with complete structure:

- models.py (database models)
- admin.py (admin interface)
- apps.py (app configuration)
- **init**.py (app initialization)
- migrations/ (database migrations)

### 8. Database Migrations

```powershell
python manage.py makemigrations  # ✅ Completed
python manage.py migrate         # ✅ Completed
python manage.py createsuperuser # ✅ Completed
```

---

## File Structure

```
hirenowpro/
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env
│   ├── core/
│   │   ├── __init__.py
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── asgi.py
│   │   ├── wsgi.py
│   │   └── celery.py
│   ├── accounts/
│   │   ├── models.py (User, RecruiterProfile)
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   ├── applicants/
│   │   ├── models.py (Applicant, ApplicantDocument)
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   ├── interviews/
│   │   ├── models.py (Interview, InterviewQuestion, VideoResponse, AIAnalysis)
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   ├── processing/
│   │   ├── models.py (ProcessingQueue, ProcessingLog)
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   ├── notifications/
│   │   ├── models.py (Notification, EmailTemplate)
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   └── results/
│       ├── models.py (InterviewResult, ReapplicationTracking)
│       ├── admin.py
│       ├── apps.py
│       └── migrations/
├── frontend/
└── document/
    └── logs.txt
```

---

## Environment Variables (.env)

```env
# Django Settings
SECRET_KEY=django-insecure--jlykf66y9jun!p93sh^_ep-f&@(rlwmst@65e7ay%4#1hmkzp
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# PostgreSQL Database
DB_ENGINE=django.db.backends.postgresql
DB_NAME=hirenowpro_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password_here
DB_HOST=localhost
DB_PORT=5432

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Celery Configuration
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Gemini AI API Key
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## Key Configurations

### REST Framework Settings

- Default authentication: JWT
- Default permission: IsAuthenticated
- Pagination: PageNumberPagination (20 items per page)

### JWT Settings

- Access token lifetime: 1 hour
- Refresh token lifetime: 7 days
- Rotate refresh tokens: Enabled
- Blacklist after rotation: Enabled

### CORS Settings

- Allowed origins: http://localhost:3000, http://127.0.0.1:3000
- Allow credentials: True

### Celery Settings

- Broker: Redis (redis://localhost:6379/0)
- Result backend: Redis
- Accept content: JSON
- Task serializer: JSON
- Result serializer: JSON
- Timezone: UTC

---

## Database Relationships

```
Applicant (1) ──→ (Many) Interview
Applicant (1) ──→ (Many) ApplicantDocument
Applicant (1) ──→ (Many) Notification
Applicant (1) ──→ (1) ReapplicationTracking
Interview (1) ──→ (Many) VideoResponse
Interview (1) ──→ (1) ProcessingQueue
Interview (1) ──→ (1) InterviewResult
VideoResponse (1) ──→ (1) AIAnalysis
InterviewQuestion (1) ──→ (Many) VideoResponse
ProcessingQueue (1) ──→ (Many) ProcessingLog
User (1) ──→ (1) RecruiterProfile
```

---

## Next Development Steps

### 1. API Development

- Create serializers for all models
- Build API endpoints (ViewSets/APIViews)
- Implement authentication endpoints (login, register, token refresh)
- Create CRUD operations for applicants
- Build interview management endpoints

### 2. Celery Tasks

- Create task for video processing
- Implement AI analysis task (LangChain + Gemini)
- Build notification sending tasks
- Create automated reapplication eligibility checker

### 3. AI Integration

- Set up LangChain with Gemini 2.5 Flash
- Implement video transcription
- Build AI analysis pipeline:
  - Sentiment analysis
  - Body language analysis (OpenCV)
  - Speech clarity scoring
  - Content relevance scoring
- Create RAG system for interview evaluation

### 4. Frontend Development

- Set up Next.js project
- Build recruiter intake portal
- Create online application form
- Develop HR portal for results
- Implement applicant dashboard

### 5. Additional Features

- Email notification system
- Video upload handling
- Real-time processing status updates
- Admin dashboard for system monitoring
- Reporting and analytics

---

## Running the Application

### Start Django Development Server

```powershell
cd backend
python manage.py runserver
```

Access at: http://localhost:8000/admin

### Start Celery Worker

```powershell
python -m celery -A core.celery worker -l info -P solo
# Windows dev: force solo pool; prefork is Linux-only and crashes on Python 3.13.
```

### Start Redis Server

```powershell
# If using Docker:
docker run -d -p 6379:6379 redis

# Or install Redis for Windows and run:
redis-server
```

---

## Testing

### Run Tests

```powershell
pytest
```

### Check Django Configuration

```powershell
python manage.py check
```

### Validate Models

```powershell
python manage.py validate
```

---

## Important Notes

1. **Custom User Model**: Using `accounts.User` as AUTH_USER_MODEL
2. **File Storage**: Videos and documents are stored in MEDIA_ROOT
3. **Async Processing**: All AI analysis happens asynchronously via Celery
4. **Security**: Update SECRET_KEY and passwords in production
5. **Database**: PostgreSQL recommended for JSON field support
6. **Redis**: Required for both caching and Celery broker

---

## Troubleshooting

### Common Issues

**Issue**: Django not found
**Solution**: Ensure virtual environment is activated and packages installed in correct location

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Issue**: Database connection error
**Solution**: Update .env file with correct PostgreSQL credentials and ensure PostgreSQL is running

**Issue**: Redis connection error
**Solution**: Ensure Redis server is running on localhost:6379

---

## Contact & Documentation

- Project Location: `C:\Users\dc\PycharmProjects\hirenowpro`
- Documentation: `document/` folder
- Date Created: November 10, 2025
- Django Version: 5.1.3
- Python Version: 3.13.5

---

**Status: Backend Structure Complete ✅**

- Total Apps: 6
- Total Models: 14
- Migrations: Applied
- Superuser: Created
- Ready for API development and AI integration
