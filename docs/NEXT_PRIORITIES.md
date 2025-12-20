# HireNowPro Next Priorities

## P1 — Stability & Clarity
- Review applicant + interview status transitions; document and enforce.
- Align naming: keep status (workflow) separate from outcome (passed/failed).
- Lock API contracts (summary vs details) and prevent heavy fields on list endpoints.

## P2 — UX & Performance
- Keep pagination + filters (status, outcome, date) enforced server-side.
- Avoid over-fetching; maintain summary-first, details-on-demand.
- Clear applicant-facing messages for blocking states (reapply wait, processing).

## P3 — Security (Deferred, Planned)
- Resume requirement enforcement.
- Status visibility rules (who can see what).
- Anti-enumeration protections and magic-link/login safeguards.

## P4 — Scaling Preparation
- Readiness for 200+ applicants/day: index review, query profiling.
- Background job monitoring (Redis + Celery health).
- Capacity checks for AI processing latency.

## What NOT to do yet
- No new complex features until status/outcome clarity is locked.
- Do not join heavy/PII data into summary lists.
- Do not add arbitrary date pickers or unbounded filters without indexes.
