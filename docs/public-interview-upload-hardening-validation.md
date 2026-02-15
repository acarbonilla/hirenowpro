# Public Interview Upload Hardening Validation

## Scope
- Endpoint: `POST /api/public/interviews/<uuid>/video-response/`
- View: `PublicInterviewViewSet.video_response`
- Throttle scopes:
  - `public_interview_upload`
  - `public_interview_upload_burst`
  - `public_interview_upload_sustained`

## What Was Hardened
- Upload throttle classes now include a local scope guardrail:
  - missing/invalid upload scope rates no longer raise `ImproperlyConfigured`
  - safe fallback rates are used for upload scopes
- Upload throttling now returns explicit `429` payload:
  - `code`, `detail`, `request_id`, and throttle metadata when available
- Backend structured logs for upload start/complete/throttle:
  - `request_id`, `interview_uuid`, `method`, `path`, `client_ip`
  - `content_length`, `uploaded_file_size`, throttle decisions, response status
- Frontend upload flow is single-flight:
  - in-flight guard prevents duplicate POSTs
  - auto-upload does not silently retry after failure
  - explicit manual retry button is shown instead
  - submit button is disabled while upload is in progress
- Frontend upload trace logs are env-gated:
  - set `NEXT_PUBLIC_UPLOAD_TRACE=true`
  - emits `upload_start`, `upload_done`, `upload_error` with attempt count

## Validation Steps
1. Single upload verification
- Start an interview and answer question 1.
- Stop recording once.
- In browser DevTools Network tab, verify exactly one `POST` request to:
  - `/api/public/interviews/<uuid>/video-response/`
- In backend logs, verify a single `request_id` sequence for that submit:
  - `public_interview_upload_start`
  - `public_interview_upload_complete`

2. Throttle verification (429, not 500)
- Send rapid uploads (example with same token/uuid):
```bash
for i in 1 2 3 4 5; do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer <INTERVIEW_TOKEN>" \
    -F "question_id=<QUESTION_ID_$i>" \
    -F "duration=00:00:05" \
    -F "video_file_path=@./sample.webm;type=video/webm" \
    https://<HOST>/api/public/interviews/<PUBLIC_UUID>/video-response/
done
```
- Confirm responses include `429` once burst limit is exceeded.
- Confirm no `500` occurs.
- Confirm logs include:
  - `public_interview_upload_throttled`
  - `throttle_limit_exceeded`
  - blocked scope/class in payload/log context

3. Concurrency check
- Trigger two uploads in parallel (two terminals/users) against the same interview or two separate interviews.
- Confirm API remains responsive and returns valid statuses (`201`/`429`) without worker crash.
- Confirm both request paths produce distinct `request_id` values in logs.

## Operational Notes
- Use production-safe env overrides as needed:
  - `PUBLIC_INTERVIEW_UPLOAD_RATE`
  - `PUBLIC_INTERVIEW_UPLOAD_BURST_RATE`
  - `PUBLIC_INTERVIEW_UPLOAD_SUSTAINED_RATE`
- Restart app workers after settings changes so throttle config is reloaded.
