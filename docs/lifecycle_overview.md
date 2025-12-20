# Applicant and Interview Lifecycle Overview

This document is the single source of truth for how Applicant, Interview, and AI/HR review flow through the system. It is intended to prevent logic drift, UI confusion, and future regressions.

## Core principles
- Applicant is the primary person entity.
- Interview is a time-bound evaluation session for an applicant.
- AI provides advisory scores and recommendations.
- HR makes final decisions.
- HR overrides only apply at the question/video level.
- Interview aggregate score is derived, not manually set.

## Entities and ownership
1) Applicant
   - Owner: System and HR (status updates).
   - Used by: Applicants page (person-centric), applicant-facing status pages.

2) Interview
   - Owner: System (state transitions), HR (decision).
   - Used by: HR Review Queue, Interview Review, Interview Records.

3) Video Response (Question level)
   - Owner: System (ingest, AI analysis), HR (per-question overrides).
   - Used by: Interview Review, Interview Records.

4) AI Analysis
   - Owner: System (Celery + AI service).
   - Used by: Interview Review (advisory).

5) HR Decision
   - Owner: HR.
   - Applied at interview level only.

6) Reapplication rules
   - Owner: System.
   - Applied at applicant level on status changes.

## Scoring aggregation flow
1) Each question gets:
   - Transcript
   - AI analysis (scoring breakdown)
   - AI score
2) HR may apply per-question override:
   - Optional HR comment required if abs(override - ai_score) > 20
3) Interview aggregate score:
   - average(coalesce(question.hr_override_score, question.ai_score))
4) AI recommendation:
   - derived from aggregate score thresholds (pass/review/fail)
5) HR adjusted aggregate:
   - derived from per-question overrides, not manually edited

Editable vs advisory
- Editable: per-question override score and HR comment
- Advisory: AI recommendation and AI scores
- Final: HR decision (hire/reject/hold)

## HR decision flow
1) AI recommendation displayed in Interview Review
2) HR selects decision:
   - Hire
   - Reject
   - Hold
3) HR decision locks interview for further changes unless reopened
4) Applicant status updates
5) Reapplication date computed if failed status applies

## Reapplication rules (current behavior)
- Applicant status transitions to failed/passed/etc can set reapplication_date
- Reapplication blocked if applicant has a reapplication_date in the future
- Reapplication allowed when reapplication_date is in the past

## Page ownership map
| Page | Purpose | Read/Write | Visible states | Transitions |
| --- | --- | --- | --- | --- |
| Applicant Registration | Create applicant | Write | Applicant: Created, Pending | Creates applicant |
| Application Status Page | Applicant-facing status | Read-only | Applicant: Pending, In Review, Passed, Failed | None |
| HR Review Queue | Work inbox | Read-mostly | Interview: Pending HR Review | Open Interview Review |
| Interview Review | Decision workspace | Read/Write | Interview: Completed -> Pending HR Review | Per-question overrides, HR decision |
| Interview Records | Read-only history | Read-only | Interview: Completed, Reviewed, Finalized | None |
| Applicants | Person lifecycle | Read-only | Applicant lifecycle states | None |

## Notes on archived states
"Archived" states are not currently implemented as discrete model values. Treat archival as a future retention feature rather than active logic.

