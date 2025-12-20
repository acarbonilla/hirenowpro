# HireNowPro – HR Dashboard Debugging Journal
Date: 2025-12-15

## Scope
HR Dashboard, Results, Interview Review, Performance

## Summary
Documented authentication fixes, routing corrections, ORM query errors, and performance optimizations for HR results and review flows.

## Key Fixes
- Switched HR login to `/auth/hr-login/` and isolated HR token storage to avoid applicant-token collisions.
- Mounted `results.urls` under the HR namespace and aligned frontend calls to `/hr/results/summary/`.
- Added a lightweight results summary serializer and endpoint to avoid computed-field lookups (`full_name`) on the DB layer.
- Removed `select_related` + `only` conflicts and limited queries to real fields (`final_score`, `result_date`, `applicant_id`, `interview_id`).
- Hardened review summary with a serializer mapping to real fields and safe recommendation derivation from `SystemSettings`.
- Split review page fetch into summary-first render with lazy-loaded details; added skeleton + disabled print until details load.

## Performance Outcome
- Dashboard: instant render.
- Results list: lightweight paginated summary, fast.
- Review page: summary renders first; details load asynchronously (no 12s blocking).

## Issues Encountered
- 500 from querying computed `full_name` via `only()`.
- 500 from mismatched review fields (`overall_score`, `ai_analysis`) not present on `InterviewResult`.
- 404s due to results URLs not mounted under HR.
- Deferred-field error from combining `select_related("applicant")` with deferred fields.

## Decisions
- Keep summary and details endpoints separate; summary is read-optimized, details are lazy.
- Prefer serializer mapping over DB annotations for computed fields.
- Explicit URL mounting under HR to avoid frontend path ambiguity.
- Disable print/export until heavy details are available.

## Lessons Learned
- Always align queryset fields to real DB columns; computed properties belong in serializers.
- Avoid mixing `select_related` with deferred fields unless necessary.
- Perceived performance improves by staging network calls (summary → details).
- Namespace APIs explicitly and mirror paths in frontend configs.

## Next Steps
- Add caching or ETag support on summary endpoints if traffic grows.
- Add smoke tests for HR routes to catch 404/FieldDoesNotExist regressions.
- Consider background prefetch for details when user hovers/pauses on list rows.
