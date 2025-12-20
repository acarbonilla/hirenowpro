TASK: Create a full system state diagram for Applicant + Interview lifecycle (bird’s-eye view)

GOAL:
Produce a single, authoritative lifecycle map that explains how an Applicant and their Interviews move through the system from start to finish, across AI, HR, and system automation.

This diagram must help:
- Prevent logic bugs
- Prevent UI confusion
- Guide future features safely
- Give maintainers instant system understanding

SCOPE:
Documentation + diagrams (no production code changes)
Focus on truth, not UI polish

ENTITIES TO MODEL:
1. Applicant
2. Interview
3. Interview Question / Video
4. AI Evaluation
5. HR Decision
6. Reapplication Rules

LIFECYCLE TO CAPTURE:

1. APPLICANT LIFECYCLE STATES
- Created (registration submitted)
- Pending Interview
- Interview In Progress
- Interview Completed
- Under HR Review
- Hired
- Failed (Interview)
- Failed (Training)
- Failed (Onboarding)
- Passed but Not Hired
- Reapplication Locked
- Eligible for Reapply
- Archived

Each state must list:
- Who controls it (System / AI / HR)
- What can transition it
- What pages can see it

2. INTERVIEW LIFECYCLE STATES
- Created
- In Progress
- Submitted
- Processing (AI)
- Completed (AI finished)
- Pending HR Review
- HR Reviewed
- Finalized
- Archived

Each state must define:
- Trigger (user action, AI, Celery, HR)
- Side effects (scores, status updates, locks)
- Visibility (which pages show it)

3. QUESTION / VIDEO LEVEL
- Question Assigned
- Video Recorded
- Transcript Generated
- AI Analysis Completed
- Per-question Score Calculated
- Optional HR Override (per-question only)

IMPORTANT RULE:
HR overrides NEVER directly modify final decision.
They only affect per-question scoring.

4. SCORING AGGREGATION FLOW
- Per-question AI scores
- Optional per-question HR overrides
- Interview aggregate score calculation
- AI recommendation (Pass / Review / Fail)
- HR-adjusted aggregate score (derived, not manual)

Explicitly show:
- What is editable
- What is advisory
- What is final

5. HR DECISION FLOW
- AI Recommendation displayed
- HR chooses:
  - Hire
  - Reject
  - Hold
- HR comment required if override > ±20 points
- Final decision locks interview
- Applicant status updates
- Reapplication date calculated if failed

6. PAGE OWNERSHIP MAP
Map each page to lifecycle stages:

- Applicant Registration
- Application Status Page
- HR Review Queue
- Interview Review
- Interview Records
- Applicants (person-centric)

Each page must state:
- Read-only vs action
- Which states it can see
- Which transitions it can trigger

7. OUTPUT FORMAT
Produce:
- A clear textual lifecycle spec (markdown)
- One high-level state diagram (Mermaid or ASCII)
- One flow diagram for Applicant ↔ Interview relationship
- A glossary of terms to prevent naming drift

DELIVERABLES:
- `docs/lifecycle_overview.md`
- `docs/applicant_state_diagram.md`
- `docs/interview_state_diagram.md`
- Optional Mermaid diagrams embedded in markdown

ACCEPTANCE CRITERIA:
- A new developer can understand the system in <15 minutes
- No state overlaps or ambiguous ownership
- Clear separation of AI advisory vs HR authority
- Diagram matches current implementation reality
