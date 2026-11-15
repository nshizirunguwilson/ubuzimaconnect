# Final Project video: script and shot list

**One video, 9 minutes 30 seconds** (the brief allows 5 to 10). It covers, in this order: what the system is, the problem, why it is a problem, the solution, and a demo that shows every user's functions from the SRS and the system design.

**How it is made:**

1. **Your voice:** you record each clip below, word for word, as its own audio file.
2. **The screen:** every demo shot is recorded by script on a local copy of the app (the same code as the live site). The slides come from the deck.
3. **The edit:** each shot is fitted to your clip. A small label in the corner names each requirement as it appears, for example `FR 6.3 Offer a case`.
4. **The live site:** a short shot of https://ubuzima.wilsonn.tech in a normal browser, with the address bar, proves the deployment.

Long waits (15 minutes, 6 hours, 24 hours, 7 days) are not sat through. On the local copy the record's time is moved back, so the app's own rules act at once, and the label says **"time skipped"**.

## Recording your voice

- One file per clip, named exactly as below (for example `03-patient.m4a`). Voice Memos or QuickTime is fine.
- Quiet room, phone or headset microphone about a hand's width from your mouth.
- Calm pace, about 140 words a minute. The target time is a guide: a few seconds over or under is fine, the video is fitted to you.
- Leave one second of silence at the start and end of each file.
- If you stumble, record that clip again. You can change any words so they sound like you; keep the meaning.
- Put the files in `video/voice/` inside the project folder (not pushed to GitHub).

## Overview

About 1171 words in all: roughly 8 minutes of speech at a calm pace, plus pauses on the screens.

| Clip | Time | Part | Words |
|---|---|---|---:|
| 00 | 0:00 to 0:20 | What the system is | 43 |
| 01 | 0:20 to 1:30 | The problem, and why it is a problem | 150 |
| 02 | 1:30 to 2:15 | The solution, the users and the design | 93 |
| 03 | 2:15 to 3:55 | Demo: patient | 235 |
| 04 | 3:55 to 5:35 | Demo: health agent, day and night | 224 |
| 05 | 5:35 to 6:35 | Demo: clinician | 133 |
| 06 | 6:35 to 7:00 | Demo: public and pharmacy | 39 |
| 07 | 7:00 to 7:40 | Demo: facility manager | 52 |
| 08 | 7:40 to 8:30 | Demo: administrator | 91 |
| 09 | 8:30 to 8:50 | The live site | 30 |
| 10 | 8:50 to 9:30 | Testing, limits and close | 81 |

---

## 00 · What the system is (0:00 to 0:20) · `00-intro.m4a`

**Say:**

> Hello, I'm Wilson Nshizirungu, and this is UbuzimaConnect: a connected patient record and triage system for Rwanda. A patient asks for help on a phone, a health agent checks the case, and the patient is sent to a facility that can receive them.

**Screen:** title slide.

---

## 01 · The problem, and why it is a problem (0:20 to 1:30) · `01-problem.m4a`

**Say:**

> In Rwanda, many patients travel to the wrong facility, or arrive too late. A trip to a health centre costs time and money, and when the facility has no free bed or no doctor for that problem, the patient has to travel again.
>
> Digital care has worked here before. Babyl served about two point eight million people, around one in five Rwandans. But it was owned abroad, and when its parent company failed in 2023, the service closed overnight. More than a thousand respiratory and malaria cases went straight back to facilities that weren't ready for them.
>
> e-Ubuzima, the national record system, keeps records, but it is in fifteen of thirty districts so far, and nothing in it checks how urgent a case is or sends the patient to a facility with space.
>
> So the gap isn't only records. It's getting the right patient to the right place, in time.

**Screen:** problem slide, then the evidence slide with its four numbers (2.8M, overnight, 1,055 + 246, 15 districts).

---

## 02 · The solution, the users and the design (1:30 to 2:15) · `02-solution.m4a`

**Say:**

> UbuzimaConnect is my solution. It has six kinds of users: patients, health agents, clinicians, facility managers, administrators, and pharmacies.
>
> The main process is simple. Danger signs are checked first. Then an AI suggests how urgent the case is, and a trained health agent always decides. The agent sends the patient to the nearest facility with the right service, a free bed and a clinician on duty, and the bed is held for them.
>
> The website runs on Vercel, and the API, the database and a mock national ID service run together in Azure.

**Screen:** objectives slide, then the system design slide (the six user types and the architecture), then the deployment diagram (`docs/srs/deployment-diagram.png`).

---

## 03 · Demo: patient (2:15 to 3:55) · `03-patient.m4a`

**Say:**

> Let's follow a patient. Aline logs in with her national ID, her date of birth and one name. There's no password: the details are checked against the national ID service. Wrong details are refused with a clear message, five wrong tries lock the ID for fifteen minutes, and if the service is down, she's told so and can still reach emergency help. She can also say she's on a shared phone, and nothing stays behind.
>
> As a parent, she sees her own record and her children's. A seventeen-year-old logs in herself and sees only her own.
>
> Her son Kevin is sick. She picks him, shares her location, or chooses her sector if she prefers. The phone saves the five nearest facilities, so they still show without internet.
>
> First, the danger signs, all on one screen. Here she answers "None", and describes the problem, how long, and how bad. The AI gives its suggestion, and the case goes to a health agent. A very short description is never marked minor.
>
> If she had answered yes to a danger sign, the case would be urgent at once, with the nearest facility and the emergency number. A newborn baby is urgent straight away.
>
> She can ask for a call instead, and only then is a phone number needed. She can cancel, she can keep going offline, and later she sees all her records, prescriptions, and who opened them.

**Screen (patient in phone view, 375 px):**

| Shot | What happens | Labels |
|---|---|---|
| 3.1 | Login: ID in six boxes, date of birth, name; logged in | FR 1.1 Verify national ID · FR 1.2 Knowledge-based check |
| 3.2 | Wrong name: plain message; then a made-up ID refused | FR 1.4 Reject invalid access |
| 3.3 | Fifth wrong try: "locked for 15 minutes" with the Emergency button | FR 1.6 Lock after failed attempts |
| 3.4 | Mock NIDA switched off: "Verification is temporarily unavailable" with the Emergency button | FR 1.5 Verification unavailable |
| 3.5 | "This is not my device" ticked; later the idle logout back to the login page (time skipped) | FR 1.8 Shared device option · FR 1.7 Patient session timeout |
| 3.6 | Home: Aline, Kevin, Grace; her record with the identity photo | FR 1.3 Family access model · FR 1.10 Identity photo |
| 3.7 | Ange (17) logs in and sees only herself; her sister's record address is refused | FR 1.3 · FR 9.1 Patient access |
| 3.8 | Get help → Who is sick? → Kevin; Use my location | FR 3.1 Choose who is sick · FR 3.3 Capture current location |
| 3.9 | Grace: location refused, Province, District, Sector picker | FR 3.4 Manual location fallback |
| 3.10 | The 5 saved facilities shown offline | FR 3.5 Save nearby facilities |
| 3.11 | Danger-sign checklist on one screen, "None of these" last | FR 3.6 Red-flag checklist |
| 3.12 | Description, how long, how bad; sent; "Get help" again opens the same case | FR 3.7 Submit symptoms · FR 3.2 One open case per person |
| 3.13 | The AI result reaches the agent's queue (split screen) | FR 4.3 Categorise issue · FR 4.4 Set triage level · FR 4.9 Human review of every case |
| 3.14 | Two-word description: Uncertain | FR 4.5 Escalate uncertainty |
| 3.15 | Claudine: "Yes" to a danger sign: Urgent at once, nearest facility, distance, 912, "An agent will contact you." | FR 4.1 Red-flag override · FR 5.5 Immediate guidance |
| 3.16 | A 3-day-old baby: Urgent with no questions | FR 4.2 Automatic urgency for newborns |
| 3.17 | Prefer a call: number and whose it is; no number asked anywhere else | FR 3.8 Prefer a call · FR 3.9 Phone number not required |
| 3.18 | Offline: "Not sent yet", saved facilities, then sent when back online | FR 3.10 Work offline |
| 3.19 | "I no longer need help": Cancelled by patient | FR 3.11 Cancel a case |
| 3.20 | After a case: the 1 to 5 rating | FR 6.15 Close a case (rating) |
| 3.21 | Records: visit, notes, prescriptions including an expired one; Print summary; Activity list | FR 7.2 Patient view of records · FR 11.4 Keep after expiry · FR 10.2 Patient activity list |

---

## 04 · Demo: health agent, day and night (3:55 to 5:35) · `04-agent.m4a`

**Say:**

> Now the health agent. Staff log in with a password and a six-digit code sent by email. Diane, the day agent, goes Available. Cases are offered urgent first, one at a time, and each offer waits thirty seconds before moving to the next agent.
>
> The agent sees the whole case: the photo, the danger signs, the AI's suggestion and its reason, and past prescriptions. If the AI is down, the case is simply marked uncertain. Anything can be changed, and every change is saved with the agent's name.
>
> The agent chats with the patient live, or calls them. Minor problems can be handled remotely, even with a prescription that has its own code. Otherwise the agent confirms the routing: the needed service, whether a bed is needed, the nearest suitable facility and the clinician on duty. The bed is held. If no facility has a free bed, the agent is alerted at once.
>
> If nobody accepts an urgent case, all agents and the administrator are alerted after two minutes, then by email. If an agent loses connection, the case goes back to the queue.
>
> At seven in the evening, the night agent, Eric, takes over. Diane can't leave with a case open, so the case is released to Eric. With no agent online, patients are told what to do, and the administrator is alerted.

**Screen (agent in a desktop window; patient beside it when both are shown):**

| Shot | What happens | Labels |
|---|---|---|
| 4.1 | Diane logs in: password, a wrong code refused, the right code from the demo inbox | FR 2.1 Staff login · FR 2.2 Two-factor authentication |
| 4.2 | Status Available; Away and Offline; Busy set by itself on accepting | FR 6.1 Agent status |
| 4.3 | Three cases waiting; offered Urgent, then Uncertain, then Minor; the 30-second countdown | FR 6.2 Queue order · FR 6.3 Offer a case |
| 4.4 | Trying to take a second case: refused | FR 6.4 One active case |
| 4.5 | The case: photo, danger signs, AI result and reason, prescription history; a change saved with name and time | FR 6.5 Review and confirm · FR 11.6 Prescription history |
| 4.6 | A case with the AI failing: "Uncertain: AI unavailable" | FR 4.7 AI unavailable |
| 4.7 | Chat both ways, quick replies, the push notification on the phone | FR 6.6 Chat with patients |
| 4.8 | A call request: number, owner, date of birth check, call note; 3 missed calls close as No response (time skipped) | FR 6.7 Call patients |
| 4.9 | Minor case: advice and a prescription with its own code and QR; My prescriptions, one cancelled | FR 6.8 Handle minor cases remotely · FR 11.1 Issue prescription · FR 11.2 Prescription code · FR 11.5 My issued prescriptions |
| 4.10 | A silent patient: Minor closes as No response after 10 minutes; Urgent can't (time skipped) | FR 6.9 Patient not responding |
| 4.11 | Routing: service pre-selected, bed needed Yes, only capable facilities, nearest first; a farther one needs a reason; confirmed for 24 hours, bed reserved, clinician assigned | FR 5.1 Choose needed service · FR 5.2 Bed needed · FR 5.3 Match to capable facility · FR 5.4 Rank by proximity · FR 5.6 Confirm routing · FR 5.7 Reserve bed · FR 5.12 Assign attending clinician |
| 4.12 | Routing changed: old bed freed, new facility | FR 5.10 Change routing |
| 4.13 | Every facility full: "No beds currently available" and the agent's alert | FR 5.8 No free bed |
| 4.14 | Close as Routed with a note; the record address now refused | FR 6.15 Close a case · FR 9.2 Agent access |
| 4.15 | Urgent case waiting 2 minutes: alert to all agents and the admin; pause a Minor case to take it; 5 minutes: email in the inbox (time skipped) | FR 6.10 Escalation level 1 · FR 6.12 Pause for an urgent case · FR 6.11 Escalation level 2 |
| 4.16 | Browser closed: Offline after 60 seconds, case back in the queue | FR 6.14 Lost connection |
| 4.17 | Agent reports: own cases, outcomes, handling time, ratings | FR 12.8 Reports (agent) |
| 4.18 | **19:00 Kigali time:** Eric (night agent) logs in, Available; Diane can't go Away with a case, releases it, Eric accepts | FR 6.16 End of shift · FR 6.3 Offer a case |
| 4.19 | Eric Offline: three patients see the message for their level; admin alerted | FR 6.13 No agent online |

---

## 05 · Demo: clinician (5:35 to 6:35) · `05-clinician.m4a`

**Say:**

> At the facility, the clinician on duty sees who is coming: a summary only, no name, until the patient arrives. The clinician compares the photo and marks them arrived, and the held bed becomes theirs. Only the attending clinician opens the full record, during the visit.
>
> The clinician writes in the record, and every edit keeps the earlier version. Prescriptions can be issued and cancelled, and the patient can be handed over to a colleague, or, when there's no free bed, transferred to the nearest facility that has one. The record follows the patient there.
>
> When the patient is discharged, the bed is free again. If a clinician is marked unavailable, routing skips them at once, and their waiting patients go to a colleague. Routings that nobody arrives for expire after a day.

**Screen (clinician in a desktop window):**

| Shot | What happens | Labels |
|---|---|---|
| 5.1 | Patients → On the way: summary only; full record refused before arrival | FR 7.4 Incoming patients · FR 9.3 Clinician access |
| 5.2 | Compare the photo, Mark arrived; once with "doesn't match", refused | FR 7.5 Mark arrival |
| 5.3 | Full record for the attending clinician; another clinician refused | FR 7.6 Attending clinician access |
| 5.4 | Record entry written, then edited: earlier version kept | FR 7.7 Update record after care |
| 5.5 | Assign a bed: free beds go down by one | FR 7.8 Assign bed |
| 5.6 | Prescription from the visit; cancel one's own; can't cancel the agent's | FR 11.1 Issue prescription · FR 11.3 Cancel prescription |
| 5.7 | Hand over to a colleague, who is notified | FR 7.11 Hand over patient |
| 5.8 | No free bed: Transfer; the patient appears at Remera, with the Kacyiru entries in the record | FR 7.9 Transfer patient · FR 7.1 Store records · FR 7.3 Retrieve across facilities |
| 5.9 | Discharge: free beds go up by one, access ends | FR 7.10 Discharge patient |
| 5.10 | Mark unavailable: the next mental health case finds no facility, Urgent with 912; a waiting patient moves to a colleague | FR 8.5 Mark unavailable · FR 5.9 No matching facility · FR 5.13 Automatic reassignment |
| 5.11 | A routing nobody arrived for, gone from the list after 24 hours (time skipped) | FR 5.11 Routing expiry |
| 5.12 | Clinician reports | FR 12.8 Reports (clinician) |

---

## 06 · Demo: public and pharmacy (6:35 to 7:00) · `06-public.m4a`

**Say:**

> Some things need no account. Anyone can open the emergency page: the emergency number and the nearest facility with emergency care. And a pharmacist checks a prescription by its code or QR code: valid, cancelled, expired, or not found.

**Screen:**

| Shot | What happens | Labels |
|---|---|---|
| 6.1 | Emergency page without logging in; other pages send you to login | FR 1.9 Emergency without login · FR 9.6 Public access |
| 6.2 | `/check`: a valid code with medicines, prescriber and licence; then cancelled, expired and unknown codes | FR 11.7 Prescription check page · FR 11.3 · FR 11.4 |

---

## 07 · Demo: facility manager (7:00 to 7:40) · `07-manager.m4a`

**Say:**

> The facility manager keeps the facility's information right: its services, its location, and whether it's active. The manager sets the number of beds, manages the clinicians' accounts, and builds the weekly schedule of day and night shifts, where gaps are flagged. The manager sees the facility's reports, but never a patient's record.

**Screen:**

| Shot | What happens | Labels |
|---|---|---|
| 7.1 | Profile: services, level of care, location, active switch | FR 8.1 Manage capabilities |
| 7.2 | Beds: total changed; a number below beds in use refused | FR 8.3 Set bed capacity |
| 7.3 | Clinicians: create, edit, deactivate | FR 8.2 Manage clinician accounts |
| 7.4 | Weekly schedule with the uncovered shifts flagged | FR 8.4 Weekly schedule |
| 7.5 | Reports, CSV download; a patient record address refused | FR 12.8 Reports (manager) · FR 9.4 Facility manager access |

---

## 08 · Demo: administrator (7:40 to 8:30) · `08-admin.m4a`

**Say:**

> The administrator runs the system: creating facilities and staff accounts. Each new person gets an email invitation to set a password. Accounts are deactivated, never deleted. Staff accounts lock after five wrong passwords and unlock only with an emailed code, and staff can reset a forgotten password.
>
> The administrator plans the agents' shifts and sees who is on duty right now, manages the danger-sign questions in both languages, can switch the AI off, and sees every alert, every report, and a log of every action, but can't open patient records either.

**Screen:**

| Shot | What happens | Labels |
|---|---|---|
| 8.1 | Create a facility, a manager and an agent; the invitation; setting the password (sign-up) | FR 12.1 Create accounts · FR 2.6 Staff invitation |
| 8.2 | Deactivate an agent with a case: kept, case back in the queue; change an email | FR 12.2 Deactivate accounts · FR 12.3 Change staff email |
| 8.3 | Five wrong passwords: locked; unlock code from the email; Forgot password; idle logout (time skipped) | FR 2.3 Temporary lock · FR 2.4 Email unlock · FR 2.7 Password reset · FR 2.5 Staff session timeout |
| 8.4 | Agent schedule: Diane days, Eric nights; On duty with a scheduled Offline agent highlighted | FR 12.4 Agent schedule · FR 12.5 On-duty dashboard |
| 8.5 | Red-flag list: add, edit, remove, in both languages | FR 12.6 Manage red-flag list |
| 8.6 | AI switch off: a new case goes to the queue as Uncertain | FR 4.8 AI switch |
| 8.7 | Alerts page | FR 12.7 Alerts |
| 8.8 | Activity log of every user; a manager sees only their own staff | FR 10.1 Log access · FR 10.3 Staff activity |
| 8.9 | Reports for the month; a patient record address refused; log out | FR 12.8 Reports (admin) · FR 9.5 Administrator access |

---

## 09 · The live site (8:30 to 8:50) · `09-live.m4a`

**Say:**

> Everything you've just seen is the same code that runs live, here at ubuzima dot wilsonn dot tech. Anyone can open it, and the demo accounts are in the README.

**Screen:** a normal Chrome window with the address bar: https://ubuzima.wilsonn.tech, the Emergency page, then `/check`. No login needed.

---

## 10 · Testing, limits and close (8:50 to 9:30) · `10-close.m4a`

**Say:**

> I tested all one hundred and six functional requirements, by script and by hand for every user, and fixed what I found. Two hundred and three automated tests pass, and the AI never receives a name, an ID or a location.
>
> There are limits: the Kinyarwanda needs a native speaker's review, the national ID service is a mock, and real patient data would need hosting authorisation in Rwanda.
>
> The code is public on GitHub, and the app is live. Thank you.

**Screen:** testing slide, the test run passing (with the AI privacy test named), conclusion slide, then a closing card with the live URL and the GitHub link.

| Shot | Labels |
|---|---|
| 10.1 | FR 4.6 Protect identity |

---

## Every requirement and where it appears

All **106** functional requirements in the SRS (section 4, revision 1.3) appear on screen, each with its label.

| FR | Shot | FR | Shot | FR | Shot | FR | Shot |
|---|---|---|---|---|---|---|---|
| 1.1 | 3.1 | 3.9 | 3.17 | 5.13 | 5.10 | 7.10 | 5.9 |
| 1.2 | 3.1 | 3.10 | 3.18 | 6.1 | 4.2 | 7.11 | 5.7 |
| 1.3 | 3.6, 3.7 | 3.11 | 3.19 | 6.2 | 4.3 | 8.1 | 7.1 |
| 1.4 | 3.2 | 4.1 | 3.15 | 6.3 | 4.3, 4.18 | 8.2 | 7.3 |
| 1.5 | 3.4 | 4.2 | 3.16 | 6.4 | 4.4 | 8.3 | 7.2 |
| 1.6 | 3.3 | 4.3 | 3.13 | 6.5 | 4.5 | 8.4 | 7.4 |
| 1.7 | 3.5 | 4.4 | 3.13 | 6.6 | 4.7 | 8.5 | 5.10 |
| 1.8 | 3.5 | 4.5 | 3.14 | 6.7 | 4.8 | 9.1 | 3.7 |
| 1.9 | 6.1 | 4.6 | 10.1 | 6.8 | 4.9 | 9.2 | 4.14 |
| 1.10 | 3.6 | 4.7 | 4.6 | 6.9 | 4.10 | 9.3 | 5.1 |
| 2.1 | 4.1 | 4.8 | 8.6 | 6.10 | 4.15 | 9.4 | 7.5 |
| 2.2 | 4.1 | 4.9 | 3.13 | 6.11 | 4.15 | 9.5 | 8.9 |
| 2.3 | 8.3 | 5.1 | 4.11 | 6.12 | 4.15 | 9.6 | 6.1 |
| 2.4 | 8.3 | 5.2 | 4.11 | 6.13 | 4.19 | 10.1 | 8.8 |
| 2.5 | 8.3 | 5.3 | 4.11 | 6.14 | 4.16 | 10.2 | 3.21 |
| 2.6 | 8.1 | 5.4 | 4.11 | 6.15 | 3.20, 4.14 | 10.3 | 8.8 |
| 2.7 | 8.3 | 5.5 | 3.15 | 6.16 | 4.18 | 11.1 | 4.9, 5.6 |
| 3.1 | 3.8 | 5.6 | 4.11 | 7.1 | 5.8 | 11.2 | 4.9 |
| 3.2 | 3.12 | 5.7 | 4.11 | 7.2 | 3.21 | 11.3 | 5.6, 6.2 |
| 3.3 | 3.8 | 5.8 | 4.13 | 7.3 | 5.8 | 11.4 | 3.21, 6.2 |
| 3.4 | 3.9 | 5.9 | 5.10 | 7.4 | 5.1 | 11.5 | 4.9 |
| 3.5 | 3.10 | 5.10 | 4.12 | 7.5 | 5.2 | 11.6 | 4.5 |
| 3.6 | 3.11 | 5.11 | 5.11 | 7.6 | 5.3 | 11.7 | 6.2 |
| 3.7 | 3.12 | 5.12 | 4.11 | 7.7 | 5.4 | 12.1 | 8.1 |
| 3.8 | 3.17 | | | 7.8 | 5.5 | 12.2 to 12.3 | 8.2 |
| | | | | 7.9 | 5.8 | 12.4 to 12.5 | 8.4 |
| | | | | | | 12.6 | 8.5 |
| | | | | | | 12.7 | 8.7 |
| | | | | | | 12.8 | 4.17, 5.12, 7.5, 8.9 |

## The system design in the video

- **Actors:** the six user types are named in clip 02 and each gets its own demo part (03 to 08).
- **Main process:** clip 02 states it (danger signs, AI suggestion, agent decides, routing with a held bed), and the demo follows one patient through it in order: patient (03), agent (04), clinician (05), pharmacy (06).
- **Architecture and deployment:** the system design slide and the deployment diagram in clip 02, and the live site in clip 09.

## Before the edit: slides to fix

The deck "UbuzimaConnect | Your Health on Time" still has old facts. Fix them before the slides are exported:

| Slide | Change |
|---|---|
| Title | Fill in the supervisor, department and date |
| System Design | Database: Azure Database for PostgreSQL, not Supabase |
| Implementation | Database: PostgreSQL on Azure, not Supabase |
| Testing | 203 automated tests; all 106 functional requirements work |
| Conclusion | All 106 functional requirements met |

Then download it as a PDF (File → Download → PDF) into `video/slides.pdf`.
