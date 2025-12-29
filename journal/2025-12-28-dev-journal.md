📘 HireNowPro – Development Journal

Date: Today
Focus: Resume / Continuation Logic for Interrupted Interviews
Status: ✅ Working and Verified

🎯 Objective for Today

Ayusin ang resume / continuation flow kapag ang applicant ay:

hindi natapos ang interview

bumalik sa portal

gumamit ng parehong email at position

Target:
➡️ Resume the SAME interview execution, hindi gumawa ng bago, at hindi bumalik sa Question 1.

🧠 Key Realizations Today

Resume ≠ Retake

Resume = continuation ng same interview

Retake = HR-authorized replacement ng completed interview

Dapat hiwalay ang logic at lifecycle

Portal-based system

Walang HR-invited interview link

Flow ay:

Positions → Register → Interview → Analysis


Resume ay nangyayari sa portal gamit ang same email

Initial Interview only

Nilimitahan ang scope ng system

AI = advisory

Result = signal

HR = decision-maker

Ito ang naglinaw ng lahat ng rules

🔴 Problems Identified

Duplicate Interview Creation

Kapag nag-register ulit gamit ang same email:

bagong Interview row ang nalilikha

bumabalik sa Question 1

Nakita ito sa Django Admin (critical proof)

No Execution State Restoration

Walang persistent current_question_index

Kahit may resume intent, execution ay nagre-reset

Wrong UX Message

“Please contact HR” → mali para sa resume scenario

Resume should be self-service

🛠️ Fixes Implemented (With Codex)
✅ 1. Registration Resume Detection

Kapag same email + same position:

IF interview status = IN_PROGRESS or CREATED
→ return resume intent

Hindi na hard error

Inalis ang HR involvement sa resume

✅ 2. Prevent Duplicate Interview Creation

Kapag resume = true:

❌ hindi na tatawag ng “create interview”

✅ reuse existing interview_id

✅ 3. Resume Execution Restoration (Critical)

Added / enforced:

current_question_index

After every answered question:

index increments

On interview load:

UI jumps to next unanswered question

progress bar restored correctly

✅ 4. Server-side Uniqueness Guard

Rule:

One applicant + one position = one active interview
(until SUBMITTED or ARCHIVED)

Backend is authoritative (not just frontend)

🧪 Validation Performed

Test Flow:

Start interview

Answer 1–2 questions

Close tab

Go to Positions

Click Resume Interview

Confirm:

Resumes at correct question

Progress bar is accurate

❌ No new Interview row created (checked in Django Admin)

✅ All passed.

🧭 Current System Behavior (Locked)
Scenario	Result
Interrupted interview	Resume automatically
Same email, same position	Resume
Submitted interview	Block (already submitted)
Archived interview	Require retake
Different email	New applicant
Different position	New interview
🧩 Design Philosophy Reaffirmed Today

Competency-based analysis

No unfair mixing of skills

AI is advisor, not judge

Resume is empathy, not loophole

Retake is exception, not default

Initial Interview system only (gatekeeper)

✅ Outcome of the Day

Resume logic is now real, not just conceptual

Interview execution is resilient

Data integrity preserved

Admin records are clean

Applicant experience is humane

HR trust is protected

📌 Next (Optional, Parked for Later)

UX polish (status pill, resume banner)

Telemetry for resume usage

Auto-expiration rules for abandoned interviews

HR visibility: “Interview interrupted at Qx/y”