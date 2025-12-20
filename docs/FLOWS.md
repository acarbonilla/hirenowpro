# HireNowPro Lifecycles

## Applicant Lifecycle
pending → processing → completed → passed/failed → reapply_wait → eligible

- Triggers: Applicant submits; AI/processing updates; HR final decisions; system clocks reapply windows.
- Async steps: AI scoring, processing queue, HR review.
- Immutable states: completed outcomes (passed/failed) are recorded; reapply windows managed separately.

## Interview Lifecycle
created → submitted → processing → completed → reviewed

- Triggers: Applicant actions (submit), system processing (processing/completed), HR actions (reviewed).
- Async steps: processing (AI), review can occur after completion.
- Immutable states: completed interview content (responses) should not mutate; review adds decisions/overrides.
