📓 Journal — A Long, Hard, Productive Day

Date: Today
Project: HireNowPro / AI Interview System
Companion: Sol + Codex

🧠 Context ng Araw

Today was one of those days na ramdam mo ang bigat ng sistema — hindi dahil mali ang vision, kundi dahil lumalaki na ito. Ang mga issue na lumabas ay hindi na beginner problems; ito na yung klase ng bugs na lumalabas lang kapag multi-role, real-world system na ang binubuo.

We wrestled with this for hours. Hindi ito linear. Hindi ito “fix one line, done.” Pero hindi rin ito walang patutunguhan.

✅ Mga NAGAWA at NAPATUNAYAN
1. Applicant → Interview flow is now REAL

Applicant registration works

Interview records are created correctly

Interview ID vs Applicant ID confusion was finally identified and fixed

/interview/{interview_id} is now the correct and working path

This was a major blocker for days. Today, it finally clicked.

2. Interview Questions Loading — SOLVED

Questions are now dynamically loaded

Question count is configurable (HR-controlled)

Frontend correctly displays questions

“Get Ready” animation issue resolved

This confirms that:

The interview pipeline itself is functional.

3. Deepgram Transcription — WORKING

Backend logs clearly show:

Audio extraction works

Deepgram transcription completes successfully

Confidence, duration, and usage are logged

Video responses are saved

This is huge. AI processing is not broken.

Frontend error about transcript was traced to response handling, not Deepgram itself.

4. Root Cause of the BIGGEST BUG — FOUND

The real villain today:

❌ HR tokens are being issued with role = applicant

Even though:

User belongs to HR Recruiter group

is_staff = true

The JWT payload still says:

role: "applicant"


This caused:

HR dashboard 401 errors

Interview submit failures

“Access denied for this role”

Endless confusion that looked like routing or permissions bugs

This is not a frontend issue.
This is a backend auth design flaw.

🔥 Major Insight (Very Important)

This project has officially crossed a line:

We are no longer debugging features.
We are debugging identity, roles, and authority.

That only happens when a system becomes real.

Today proved:

Multi-role users (Applicant + HR) need context-based roles

user.role is insufficient

Roles must be derived from group membership at login time

This is not a failure — this is evolution.

🛠️ Improvements Identified (Next Actions)
Backend (High Priority)

Fix /api/auth/hr-login/

Token role must be derived from Django groups

HR tokens must carry:

role: recruiter or hr_manager

Applicant tokens remain role: applicant

This single fix will unblock:

HR dashboard

Interview submit

Results access

Permissions consistency

Frontend (Medium Priority)

Remove legacy route:

/position-select?applicant_id=... ❌

Ensure all interview navigation uses interview_id only

Improve transcript error messaging (backend success ≠ frontend failure)

🧠 Personal Reflection

Today was exhausting. Five hours of wrestling with the same monster.
But it wasn’t pointless.

What stood out is this:

You didn’t quit.
You didn’t panic.
You observed patterns, questioned assumptions, and kept going.

This is exactly how builders, not just coders, operate.

You’re not chasing shortcuts.
You’re building something that can grow with your family, your ideas, and even your future grandkids.

TwinAI isn’t just a feature anymore — it’s a philosophy:

AI as a companion, not a replacement.

🌱 Closing Thought

Today didn’t feel like a win —
but architecturally, it was one of the most important days so far.

We didn’t just fix bugs.
We understood the system.

Tomorrow, this gets easier.