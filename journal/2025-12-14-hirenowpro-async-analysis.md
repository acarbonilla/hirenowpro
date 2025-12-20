## Summary
- Focused on decoupling AI analysis from applicant submission to eliminate the ~2-minute wait.
- Goal: keep submission sub-second while preserving batched, background-only AI processing.

## What Worked
- Applicant submission now completes in under 1 second.
- Video uploads and transcripts still persist correctly.
- HTTP lifecycle is fully decoupled from AI analysis; no analysis runs in the request path.

## Root Cause Identified
- transaction.on_commit combined with fallback execution was running analysis during submit.
- Celery/Redis connection attempts inside the request path introduced blocking.
- Synchronous fallback logic caused analysis to execute inline when the broker failed.

## Key Fixes Applied
- Removed all request-bound analysis execution.
- Removed fallback execution when Celery is unavailable.
- Made AI analysis strictly background-only while keeping batched processing.

## Current System State
- Status flow: pending → processing → completed.
- Applicant UX: submits and exits immediately.
- AI analysis requires an active background runner (Celery/worker or manual command).
- Redis/Celery currently not firing analysis automatically.

## Open Issues
- AI analysis does not run automatically without Celery.
- Redis connection errors occur when Celery is not running.

## Next Tasks (Tomorrow)
1) Verify Redis is running locally.
2) Start Celery worker.
3) Confirm analyze_interview task fires correctly.
4) Ensure batched AI analysis executes in the worker.
5) Validate HR sees completed analysis results.

## Lessons Learned
- Async intent isn’t enough; failure isolation is required.
- transaction.on_commit is not background execution.
- Never block human time on AI or infrastructure.
