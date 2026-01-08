# HireNowPro Dev Notes

## Redis & Celery
- Start Redis server (ensure configured host/port).
- Celery worker example: `celery -A backend worker -l info`
- Celery beat (if used for schedules): `celery -A backend beat -l info`

## Known Fragile Areas
- Summary vs detail endpoints: keep lists lightweight; never add transcripts/AI payloads to summaries.
- Status vs outcome: status is workflow, outcome is pass/fail from InterviewResult.
- UTF-8 hygiene: rebuild corrupted files if Turbopack/Next.js complains about invalid sequences.

## Files Requiring Caution
- `backend/results/views/results_list.py` and serializers: contract is summary-only.
- `frontend/app/hr-dashboard/results/page.tsx`: filters/pagination wired to summary API.
- Registration/resume flow: pending-application handling and redirects.

## Debugging Patterns That Worked
- Staggered loading (summary first, details after) to isolate slow endpoints.
- Values/only queries for summaries to prevent accidental heavy joins.
- Recreate corrupted files in plain ASCII/UTF-8 when build errors arise.

## Auth Role Source of Truth
- `user_type` is authoritative for auth, routing, and JWT claims.
- `role` is legacy and mirrors `user_type`; do not rely on it for access control.

## Interview TTS
- Deepgram (`aura-2-thalia-en`) is the only supported TTS for interview questions.
- Web Speech API is intentionally disabled for interview TTS.
