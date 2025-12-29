# 📘 HireNowPro — Development Journal

**Date:** Dec 27, 2025 (Night Shift)

---

## 🎯 Focus of the Day

Stabilization and correction of **retake interview workflow**, including:

* Interview lifecycle correctness
* Retake logic
* Email delivery (sync → async via Celery)
* Token expiration and resume behavior
* HR dashboard consistency

This session was heavy on **debugging real-world edge cases**, not feature-building.

---

## ✅ Major Achievements

### 1. Retake Interview Logic — Root Cause Identified

* Discovered that **multiple retakes on the same applicant** cause earlier interviews to be marked as `ARCHIVED`.
* Error was not a bug, but a **missing guard**:

  * Retake logic allowed HR to trigger retake multiple times.
* Conclusion:

  * Only **one active retake** should exist at a time.
  * Archived interviews must never be resumed.

✅ This behavior is correct by design; UI and guards were adjusted.

---

### 2. Retake Email Expired Link — REAL Bug Found

**Problem:**

* Retake email sent successfully
* Applicant clicks link → `/interview-expired`

**Root Cause:**

* Retake interview reused **old or expired token logic**
* `expires_at` not reset or still tied to previous interview

**Key Insight:**

> Retake interviews MUST generate a **fresh interview token with a fresh expiry**

---

### 3. Retake Architecture Decision (Locked In)

Each retake now follows this lifecycle:

1. Old interview → `ARCHIVED`
2. New interview created
3. New JWT token generated

   * new `interview_id`
   * new `expires_at`
4. Retake email uses ONLY the new token
5. Frontend validates against the active interview only

This matches **enterprise ATS standards**.

---

### 4. Email Sending — Migrated to Async (Celery)

* Moved applicant emails (retake, decision) to **Celery tasks**
* Fixed:

  * Task registration issues
  * Import path mismatches
  * Celery worker recognition

**Outcome:**

* Email sending is now **non-blocking**
* HR UI no longer fails if SMTP is slow

---

### 5. Permission & Role Errors Fixed

* Resolved `RolePermission is not callable` error
* Corrected DRF permission class usage

---

### 6. UI Behavior Corrections

* "Allow Retake" button:

  * Enabled only for FAILED or ON_HOLD
  * Disabled if active retake exists

* Messaging improved:

  * Clear notice when interview is archived
  * Clear success message when retake is queued

---

## 🧠 Key Insights Today

* **Archived ≠ Bug** — it is a safety feature
* Tokens must be **interview-scoped**, not applicant-scoped
* Retake is a *new lifecycle*, not a continuation
* Async email is mandatory for production stability

This day shifted the system from *prototype logic* → **production-grade workflow**.

---

## 🔍 Current Status

* Retake interview creation ✅
* Retake email delivery (async) ✅
* Archived interview protection ✅
* UI guardrails mostly in place

**Remaining to verify:**

* Fresh retake token expiry works end-to-end
* Applicant can successfully start retake interview

---

## 📝 Plan for Tomorrow

1. Test retake link using:

   * Fresh email
   * Fresh browser / incognito
2. Verify:

   * Token validity
   * Interview start
   * No redirect to `/interview-expired`
3. Finalize:

   * Retake cooldown rules
   * Max retake count (optional)
4. Prepare **final workflow diagram** for presentation

---

## 🧩 Closing Note

This session was not about speed — it was about **correctness**.

The system now behaves like a real ATS:

* Immutable interviews
* Audit-friendly
* HR-controlled
* Applicant-safe

Rest well. Tomorrow is validation day.
