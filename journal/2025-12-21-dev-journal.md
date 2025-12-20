# HireNowPro Development Journal — Today

## Focus of the Day

Stabilization of the **Initial Interview system** by aligning interview logic, question pools, competencies, and HR tooling. The main theme was moving from *pattern-based / brittle logic* to *competency-driven, category-aware rules*.

---

## Key Problems Encountered

1. **Interview Creation Failing (400 / 500 errors)**

   * Initial failures were 500 (server crash), later corrected to intentional 400 responses.
   * Root cause was *not frontend or Axios*, but strict backend interview rules encountering missing data.

2. **Question Pool Incompleteness**

   * Many job categories lacked questions for required competencies.
   * Retagging questions to `question_type = GENERAL` helped but did not fully resolve the issue.

3. **Incorrect Competency Assumptions**

   * All competencies were being treated as globally required.
   * This forced irrelevant competencies (e.g., Sales/Upselling) onto non-sales roles (e.g., Network).

4. **Poor Visibility for HR**

   * HR could not see which competencies were missing per category.
   * Problems only surfaced during interview creation instead of earlier in management UI.

5. **Duplicate Question IDs in UI**

   * React warning exposed duplicated question IDs due to backend query duplication or cloning side effects.

---

## Decisions Locked Today (Important)

### 1. Initial Interview Scope (Reaffirmed)

* Initial Interview only
* Competency-based
* Uses **GENERAL** questions only (for now)
* No tags, no subroles, no per-position micromanagement

---

### 2. Core vs Non-Core Competencies (Major Design Fix)

**Core competencies (required for ALL categories):**

* communication
* problem_explanation
* technical_reasoning

**Non-core competencies (category-scoped):**

* troubleshooting → it_support, network
* customer_handling → customer_service, sales_marketing, virtual_assistant
* sales_upselling → sales_marketing, customer_service

Rules:

* Interview creation enforces **only core + mapped competencies**
* Missing non-required competencies must NOT block interviews

---

### 3. Competency Completeness Rule (Clarified)

* Each **required competency** must have **at least 1 eligible GENERAL question**
* Competencies not required for a category may have 0 questions without error

---

### 4. Question Pool Strategy (Chosen)

**Option A chosen:** Clone generic questions to fill missing pools

* Only generic / transferable questions are cloned
* No category-specific technical questions copied incorrectly
* Minimum viable pool: 1–2 questions per required competency

Purpose:

* Unblock interview creation
* Allow system testing and iteration
* Avoid over-engineering early

---

### 5. Controlled Randomness (Interview Quality)

* Interview structure is fixed
* Question content is randomized per competency
* No repeated questions per interview
* Seeded randomness for auditability

(Fallback logic discussed and planned, but data alignment was the primary fix today.)

---

### 6. HR Questions Page Improvements

Decisions:

* Add **Competency dropdown filter** to Questions page
* Purpose: allow HR to see missing pools before interviews fail

Additional fix:

* Ensure backend questions API returns **distinct** results to avoid duplicate React keys

---

## What Was Fixed / Improved

* Interview creation now fails only for **legitimate reasons**
* System logic aligned with real-world hiring expectations
* Removed requirement to create irrelevant questions just to satisfy rules
* Improved observability for HR (competency awareness)
* Prevented future silent data corruption or weak interviews

---

## Current System State (End of Day)

* Interview engine logic: **sound and strict**
* Remaining work: **content completion + small UI enhancements**
* No frontend transport bugs remaining
* Errors now signal real configuration issues, not crashes

---

## Next Logical Steps (Tomorrow)

1. Finish cloning generic questions to satisfy:

   * Core competencies for all categories
   * Mapped non-core competencies only

2. Re-test:

   * `/api/public/interviews/` returns 201 for all active categories

3. Finalize HR Questions page:

   * Competency dropdown filter
   * Confirm no duplicate ID warnings

4. Optional:

   * Add internal logging/metrics to flag weak competency pools

---

## Closing Note

Today’s work shifted HireNowPro from *"why is this failing?"* to *"the rules now make sense"*. The system is no longer brittle — it is becoming **defensible, fair, and scalable**.

Good stopping point.
