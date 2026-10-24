# UbuzimaConnect: Requirements Checklist

This file makes sure nothing in the SRS is left out. Every functional requirement and every use case has one row: the phase it is built in, where it lives, and the proof that it works.

**The rule:**
- A phase is finished only when every row in it says **Done**, with proof.
- Before submission, every row in this file must say Done, or say plainly why not under "Known limitations" in the README.

| Status | Meaning |
|---|---|
| Done | Built, and proved by a test or a recorded check |
| Partly | Some of it is built; the note says what is missing |
| — | Not started |

**Proof** is an automated test (file named), or a browser check at 375 px and 1280 px recorded in this file.

## How we build

1. **Every phase is a vertical slice.** A feature is only "built" when its database tables, API endpoint, screen, and test all exist, and it works in the browser. There are no screens without a backend and no endpoints without a screen.
2. **Phases follow the SRS:**

   | Phase | What | FR groups |
   |---|---|---|
   | 0 | Foundation, both logins, roles | FR 1, 2, part of 9, 10, 12 |
   | 1 | A working screen for every use case | FR 3, 4, 5, 6, 7, 8, 11, 12 |
   | 2 | The full flow, end to end: patient → AI → agent → routing → facility → prescription → pharmacy | Connects phase 1 |
   | 3 | Timers and escalation, reports, offline, Kinyarwanda, push notifications | FR 3.10, 6.9 to 6.14, 12.7, 12.8, NFRs |
   | 4 | README, GitHub, deployment, video, known limitations | Rubric |

3. **Every requirement is checked again at the end of each phase** against this table. Gaps found are added to the next phase, never dropped.

---

## Functional requirements (106)

Source: the FR headings of the SRS (Assignment 2 copy, 23 Oct 2026).

### FR 1 Patient identity

| FR | Requirement | Phase | Status | Where | Proof |
|---|---|---|---|---|---|
| 1.1 | Verify national ID | 0 | Done | `/login`, `POST /auth/patient/login`, mock NIDA `/v1/verify` | `apps/api/test/auth.test.ts` |
| 1.2 | Knowledge-based check | 0 | Done | Date of birth + one name, step 2 of `/login` | `auth.test.ts`, `nida-mock/src/verify.test.ts` |
| 1.3 | Family access model | 0 | Done | A parent sees all their children at any age, records included; a child of 16+ sees only their own record | `auth.test.ts`, `records.test.ts` |
| 1.4 | Reject invalid access | 0 | Done | Same answer for every wrong detail | `auth.test.ts`, `verify.test.ts` |
| 1.5 | Verification unavailable | 0 | Done | “Verification is temporarily unavailable” + Emergency button; failure logged as `nida.unavailable` | `auth.test.ts` |
| 1.6 | Lock after failed attempts | 0 | Done | 5 tries → 15-minute lock, with the Emergency button | `auth.test.ts` |
| 1.7 | Patient session timeout | 0 | Done | 15-minute sliding expiry + `IdleLogout` | `auth.test.ts` (staff session; same code path) |
| 1.8 | Shared device option | 0–3 | Done | “This is not my device”: the cookie ends with the browser, logout clears the screen, and the device can't turn on notifications | `auth.test.ts`, `push.test.ts` |
| 1.9 | Emergency without login | 0–3 | Done | `/emergency` shows Call 912 and the nearest facility with emergency care on duty, without login (`cases.test.ts`); without a connection, the service worker serves it with the facilities saved on the device. Checked on 24 Oct 2026 with a production build: the web server stopped, `/emergency` still opened with the 5 saved facilities | `cases.test.ts`, browser check |
| 1.10 | Identity photo | 0 | Done | `GET /patients/:id/photo` (self, parent, staff) | `auth.test.ts` |

### FR 2 Staff authentication

| FR | Requirement | Phase | Status | Where | Proof |
|---|---|---|---|---|---|
| 2.1 | Staff login | 0 | Done | `/staff/login` | `auth.test.ts` |
| 2.2 | Two-factor authentication | 0 | Done | `/staff/login/code`, 5-minute code | `auth.test.ts` |
| 2.3 | Temporary lock | 0 | Done | 5 wrong passwords → 15 minutes | `auth.test.ts` |
| 2.4 | Email unlock | 0 | Done | `/staff/unlock`, 15-minute code. Administrators can’t unlock, and a password reset doesn’t unlock | `auth.test.ts` |
| 2.5 | Staff session timeout | 0 | Done | 15-minute sliding expiry | `auth.test.ts` |
| 2.6 | Staff invitation | 0 | Done | `/staff/team` → email → `/staff/invitation/:token`, 48 hours, single use; “Send again” replaces the old link. The facility manager’s own resend comes with FR 8.2 | `auth.test.ts` |
| 2.7 | Password reset | 0 | Done | `/staff/reset`, ends all sessions | `auth.test.ts` |

### FR 3 Symptom submission

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 3.1 | Choose who is sick | 1 | Done: “Who is sick?” lists the parent and all children; a mature child has no choice (`cases.test.ts`) |
| 3.2 | One open case per person | 1 | Done: a second start opens the existing case (`cases.test.ts`) |
| 3.3 | Capture current location | 1 | Done: device GPS with permission (`/cases/new`) |
| 3.4 | Manual location fallback | 1 | Done: Province → District → Sector, using the sector’s centre from NISR boundaries (`packages/shared/src/data`, `cases.test.ts`) |
| 3.5 | Save nearby facilities | 1 | Done: the 5 nearest facilities with name, distance, services and phone are saved on the device; never on a device that isn’t the patient’s (`cases.test.ts`) |
| 3.6 | Red-flag checklist | 1 | Done: one question at a time; groups A, C, N and P by age and sex; pregnancy asked only of females 12–55 (`cases.test.ts`, `triage.test.ts`) |
| 3.7 | Submit symptoms | 1 | Done: own words, how long (4 choices), how bad (1–10) (`cases.test.ts`) |
| 3.8 | Prefer a call | 1 | Done: from the home screen and the case screen; the agent sees the number and whose it is (`agent.test.ts`, `cases.test.ts`) |
| 3.9 | Phone number not required | 1 | Done: a phone number is asked only here and kept on that case (`cases.test.ts`) |
| 3.10 | Work offline | 3 | Done: answers and symptoms wait on the device in order and are sent when the connection returns; “Not sent yet: waiting for connection” with the saved facilities marked “Availability not confirmed” and Call 912; a Yes offline shows “Call 912 and go to the nearest health facility”; the remaining questions come with each step (`outbox.test.ts`, `cases.test.ts`). Checked in the browser at 375 px with the connection cut, then restored: both answers arrived in order and the case became Urgent |
| 3.11 | Cancel a case | 1 | Done: closes as “Cancelled by patient”, the agent is told, the bed is released (`agent.test.ts`) |

### FR 4 Intelligent triage

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 4.1 | Red-flag override | 1 | Done: first Yes stops the checklist, Urgent without the AI, service from the question (`cases.test.ts`) |
| 4.2 | Automatic urgency for newborns | 1 | Done: babies under 8 days are Urgent with no questions (`cases.test.ts`, `triage.test.ts`) |
| 4.3 | Categorise issue | 1 | Done: Gemini with WHO priority signs, a 10-second limit and fixed categories; tests use a stand-in Gemini (`cases.test.ts`); checked against the live service on 24 Oct 2026: a urinary complaint came back Urinary, minor, high confidence in 5.5 s |
| 4.4 | Set triage level | 1 | Done (`triage.test.ts`, `cases.test.ts`) |
| 4.5 | Escalate uncertainty | 1 | Done: all five conditions (`triage.test.ts`, `cases.test.ts`) |
| 4.6 | Protect identity | 1 | Done: only description, answers, age, sex and pregnancy are sent; checked against what the stand-in receives (`cases.test.ts`) |
| 4.7 | AI unavailable | 1–3 | Done: failures become “Uncertain: AI unavailable” with the normal message; the breaker skips the AI for 1 minute after 3 failures (`cases.test.ts`); more than 5 failures in 5 minutes alert the administrator, once per 5 minutes, by app and email (`timers.test.ts`) |
| 4.8 | AI switch | 1 | Done: while off, new cases are Uncertain without calling the AI (`cases.test.ts`, `setup.test.ts`) |
| 4.9 | Human review of every case | 1 | Done: every case is queued and offered to an agent whatever its level (`agent.test.ts`) |

### FR 5 Facility matching and routing

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 5.1 | Choose needed service | 1 | Done: all seven rules in order (`triage.test.ts`) |
| 5.2 | Bed needed | 1 | Done: red-flag routings start with Yes; the agent sets it in the triage review and on the routing (`agent.test.ts`) |
| 5.3 | Match to capable facility | 1 | Done: active, offers the service, specialty on duty now, free bed when needed (`triage.test.ts`) |
| 5.4 | Rank by proximity | 1 | Done: Haversine (`triage.test.ts`) |
| 5.5 | Immediate guidance for urgent cases | 1 | Done: Urgent patients see the nearest suitable facility, distance, call buttons, 912, and “An agent will contact you.” until it is confirmed (`agent.test.ts`, `cases.test.ts`) |
| 5.6 | Confirm routing | 1 | Done: confirm or choose another; a reason is required when not the nearest; valid 24 hours (`agent.test.ts`) |
| 5.7 | Reserve bed | 1–3 | Done: one bed held when the facility is given, kept on confirmation, released on change or cancel (`agent.test.ts`), the patient's on arrival (`clinician.test.ts`), released after 6 hours without arrival while the routing stays valid (`timers.test.ts`) |
| 5.8 | No free bed | 1 | Done: the agent sees “No beds currently available” with the nearest otherwise-suitable facility, and the event is logged |
| 5.9 | No matching facility | 1 | Done: a non-urgent case that no facility can take right now becomes Urgent and goes to the queue; the patient sees 912 and “An agent will contact you.”; logged (`phase2.test.ts`). Seen live at night, when no general-medicine clinician was on duty |
| 5.10 | Change routing | 1 | Done: the old routing becomes Changed and its bed is released (`agent.test.ts`) |
| 5.11 | Routing expiry | 3 | Done: no arrival within 24 hours: Expired, bed released, off the incoming list, no records unlocked, logged (`timers.test.ts`) |
| 5.12 | Assign attending clinician | 1 | Done: the on-duty clinician of the specialty with the fewest active patients is suggested; red-flag routings are assigned automatically; another specialty needs a reason (`agent.test.ts`). The assigned clinician is notified, saved and live (`clinician.test.ts`). Done |
| 5.13 | Automatic reassignment | 1–3 | Done: on marking unavailable, deactivation (`phase2.test.ts`) and the end of the shift (`timers.test.ts`): the colleague of the same specialty with the fewest patients, told and logged; with none, the agent is alerted or the case goes back to the front of the queue |

### FR 6 Human agent handling

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 6.1 | Agent status | 1 | Done: Available, Away, Offline; Busy set by the system (`/staff/queue`, `agent.test.ts`) |
| 6.2 | Queue order | 1 | Done: Urgent, Uncertain, Minor, oldest first (`agent.test.ts`) |
| 6.3 | Offer a case | 1 | Done: offered to the Available agent free the longest; 30 s to accept; then the next agent; only one can accept (`agent.test.ts`) |
| 6.4 | One active case | 1 | Done (`agent.test.ts`) |
| 6.5 | Review and confirm | 1 | Done: full case, photo, AI result and reason, earlier requests; every change saved with name and time (`agent.test.ts`). The patient's prescription history is shown too (`records.test.ts`) |
| 6.6 | Chat with patients | 1–3 | Done: live chat both ways under 3 s, with quick replies, saved with the case (`agent.test.ts`); when the patient doesn't have the app open, a Web Push notification, opened on the case (`push.test.ts`) |
| 6.7 | Call patients | 1 | Done: number and whose it is, date of birth confirmed first when not the patient’s, call notes, closes as No response after 3 missed calls in 10 minutes (`agent.test.ts`) |
| 6.8 | Handle minor cases remotely | 1 | Done: advice in the chat, and a prescription from the case; closing as Prescription issued needs one (`records.test.ts`) |
| 6.9 | Patient not responding | 3 | Done: No response only for a Minor case silent for 10 minutes; Urgent and Uncertain stay open (`agent.test.ts`) |
| 6.10 | Escalation level 1 | 3 | Done: an Urgent or Uncertain case not accepted in 2 minutes alerts every agent, Busy ones too, on any staff page, and the administrator in the app (`timers.test.ts`) |
| 6.11 | Escalation level 2 | 3 | Done: after 5 minutes the administrator is emailed, Uncertain patients see the nearest suitable facility and 912, alerts repeat every 2 minutes, and a delay incident is logged; the clock restarts when a case goes back to the queue (`timers.test.ts`). Seen live in the dev data |
| 6.12 | Pause for an urgent case | 1 | Done: after a level 1 alert (an Urgent or Uncertain case waiting 2 minutes), a Minor or Uncertain case can be paused; it goes to the front and the patient is told (`agent.test.ts`) |
| 6.13 | No agent online | 3 | Done: Urgent patients see the facility and 912; Uncertain the nearest suitable facility, 912 and “No agent is online right now”; Minor the SRS message; the administrator is alerted after 5 minutes, by app and email (`timers.test.ts`). Checked in the browser at 375 px |
| 6.14 | Lost connection | 3 | Done: 60 s without the agent’s live connection → Offline; the case goes back to the front with all its history; the patient is told (`agent.test.ts`) |
| 6.15 | Close a case | 1 | Done: one outcome and a note; the agent loses access; the patient rates 1–5 once (`agent.test.ts`) |
| 6.16 | End of shift | 3 | Done: no Away or Offline with an open case; Give back puts it at the front (`agent.test.ts`) |

### FR 7 Connected patient records

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 7.1 | Store records | 1 | Done: identity, cases with chats, call notes, triage, routings, outcomes and closing notes, visits, versioned clinical entries and prescriptions (`clinician.test.ts`, `records.test.ts`) |
| 7.2 | Patient view of records | 1 | Done: `/records/[id]` from each person on the home page: prescriptions (expired and cancelled too, valid ones with their QR code), visits with what clinicians wrote, every request; a printable summary at `/records/[id]/print` (`records.test.ts`). Checked in the browser at 1280 px (24 Oct 2026) |
| 7.3 | Retrieve across facilities | 1 | Done: one central database; the visit screen shows entries and visits from every facility (`clinician.test.ts`, “shows entries from earlier visits”) |
| 7.4 | Incoming patients | 1 | Done: `/staff/patients` and `/staff/incoming/[id]`: level, service, red-flag answers, symptoms, age, sex and photo, no name, to every on-duty clinician at the routed facility; off duty sees none (`clinician.test.ts`). Checked in the browser at 375 and 1280 px (24 Oct 2026) |
| 7.5 | Mark arrival | 1 | Done: photo beside the summary; Arrived starts the visit and the held bed becomes the patient's; a mismatch is recorded and the patient stays incoming; only one clinician can mark it (`clinician.test.ts`). Checked in the browser at 375 and 1280 px (24 Oct 2026) |
| 7.6 | Attending clinician access | 1 | Done: the full record opens only for the attending clinician while the visit is active; every view is logged (`clinician.test.ts`). Checked in the browser at 375 and 1280 px (24 Oct 2026) |
| 7.7 | Update record after care | 1 | Done: entries with author and time; an edit adds a version and keeps the earlier ones; no edits after the visit ends (`clinician.test.ts`). Checked in the browser at 375 and 1280 px (24 Oct 2026) |
| 7.8 | Assign bed | 1 | Done: a free bed when none was held; with none free the API refuses with NO_BED and the screen offers a transfer (`clinician.test.ts`) |
| 7.9 | Transfer patient | 1 | Done: nearest other facility with a free bed and the specialty on duty, bed held, clinician assigned and notified, shown as incoming there, visit closed as Transferred (`clinician.test.ts`) |
| 7.10 | Discharge patient | 1 | Done: Discharged frees the bed; Completed when there was none; access ends (`clinician.test.ts`). Checked in the browser at 375 and 1280 px (24 Oct 2026) |
| 7.11 | Hand over patient | 1 | Done: to an on-duty colleague at the same facility, who is notified; the first clinician loses access; logged (`clinician.test.ts`) |

### FR 8 Facility capability management

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 8.1 | Manage capabilities | 1 | Done: `/staff/facility`; services, level of care, location, active flag; logged (`setup.test.ts`) |
| 8.2 | Manage clinician accounts | 1 | Done: `/staff/clinicians`; invite with specialty and licence, edit, turn off (kept), send again; own facility only (`setup.test.ts`) |
| 8.3 | Set bed capacity | 1 | Done: held beds count as reserved, used ones as occupied, the free count follows, and the total can't go below them (`phase2.test.ts`) |
| 8.4 | Weekly schedule | 1 | Done: `/staff/schedule`; Day and Night shifts, unavailability shown, shifts missing a service flagged (`setup.test.ts`) |
| 8.5 | Mark unavailable | 1 | Done: `/staff/shifts`; routing stops using the clinician at once, and patients on the way are reassigned (`phase2.test.ts`, `setup.test.ts`) |

### FR 9 Role-based access control

| FR | Requirement | Phase | Status | Where |
|---|---|---|---|---|
| 9.1 | Patient access | 0–1 | Done | Own records and children's (FR 1.3); none of the staff endpoints (`phase2.test.ts`, `records.test.ts`) |
| 9.2 | Agent access | 0–1 | Done | Full case and history only while handling it; waiting cases show no names; access ends on closing (`agent.test.ts`) |
| 9.3 | Clinician access | 0–1 | Done | A summary of incoming patients to on-duty clinicians at the facility; full records only to the attending clinician during the visit (`clinician.test.ts`) |
| 9.4 | Facility manager access | 0–3 | Done | Own facility's profile, beds, schedule, clinicians, staff activity and reports; never patient records (`phase2.test.ts`, `reports.test.ts`) |
| 9.5 | Administrator access | 0–3 | Done | Accounts, schedules, settings, alerts, reports, activity logs and the on-duty dashboard; never patient records (`phase2.test.ts`, `timers.test.ts`, `reports.test.ts`) |
| 9.6 | Public access | 0 | Done | Emergency page and the prescription check page, no login |

### FR 10 Access logging

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 10.1 | Log access | 0–3 | Done: logins with device type, failed logins, locks, unlocks, record views (once per 10-minute sitting), triage, routings, beds, arrivals, handovers, transfers, discharges, prescriptions and checks, AI failures, expiries, escalations, delay incidents, alerts, account and settings changes |
| 10.2 | Patient activity list | 1 | Done: `/records/[id]/activity`: date, time, who (with role), what, device for logins; parents see their children's (`records.test.ts`). Checked in the browser at 1280 px (24 Oct 2026) |
| 10.3 | Staff activity | 1 | Done: `/staff/activity`: a manager sees their facility's staff, the administrator everyone, with a filter by person (`records.test.ts`) |

### FR 11 Prescriptions

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 11.1 | Issue prescription | 1 | Done: the agent during the case and the attending clinician during the visit; medicine, dose, how often, days, instructions; no approval (`records.test.ts`). Checked in the browser at 1280 px (24 Oct 2026) |
| 11.2 | Prescription code | 1 | Done: `RX-XXXX-XXXX` (40 random bits), a QR code that opens the check page, prescriber name and licence, valid 7 days (`records.test.ts`). Checked in the browser at 1280 px (24 Oct 2026) |
| 11.3 | Cancel prescription | 1 | Done: only the issuer, with a reason; the check page then says “Do not dispense” (`records.test.ts`) |
| 11.4 | Keep after expiry | 1 | Done: never deleted; shown as Expired or Cancelled (`records.test.ts`) |
| 11.5 | My issued prescriptions | 1 | Done: `/staff/prescriptions` with patient name, medicines, date and status, and Cancel on valid ones (`records.test.ts`) |
| 11.6 | Prescription history | 1 | Done: on the agent's case and the clinician's visit, only while they have access (`records.test.ts`). Checked in the browser at 1280 px (24 Oct 2026) |
| 11.7 | Prescription check page | 1 | Done: `/check`: status, patient name, medicines, prescriber and licence, issue date; “Do not dispense” and “Prescription not found”; no national ID or diagnosis; every check logged; an address trying 20 unknown codes in 10 minutes is paused (`records.test.ts`). Checked in the browser at 1280 px (24 Oct 2026) |

### FR 12 Administration and reports

| FR | Requirement | Phase | Status |
|---|---|---|---|
| 12.1 | Create accounts | 0–1 | Done: facilities (`/staff/facilities`) and agent and facility manager accounts (`/staff/team`) (`setup.test.ts`, `auth.test.ts`) |
| 12.2 | Deactivate accounts | 1 | Done: accounts turned off, never deleted, logged out at once; an agent’s active case returns to the front of the queue |
| 12.3 | Change staff email | 1 | Done: new address used for codes and links; old links cancelled (`setup.test.ts`) |
| 12.4 | Agent schedule | 1 | Done: `/staff/schedule` for the administrator shows agents, and any shift with no agent (`setup.test.ts`) |
| 12.5 | On-duty dashboard | 1 | Done: `/staff/on-duty`: every agent, scheduled now or not, status and time in it; scheduled agents who are Offline come first in red; refreshes every 15 s (`records.test.ts`). Checked in the browser at 1280 px (24 Oct 2026) |
| 12.6 | Manage red-flag list | 1 | Partly: add, edit and remove, logged; removed questions are kept (`setup.test.ts`); all 23 have a Kinyarwanda draft and are asked in the patient's language (`cases.test.ts`). **The drafts need checking by a Kinyarwanda speaker and a clinician** (`docs/translations`) |
| 12.7 | Alerts | 3 | Done: escalations, delay incidents, no agent online, no-capacity events and AI failures, at `/staff/alerts`, live on any administrator page, serious ones emailed (`timers.test.ts`). Checked in the browser at 1280 px |
| 12.8 | Reports | 3 | Done: `/staff/reports` for every staff role, by day, week or month, with a CSV download (logged). Administrators: requests by level and outcome, wait for an agent, delay incidents, no-capacity events, expired routings and released beds, AI failures, agent performance, scheduled versus online agents, minor cases closed without travel, average rating. Managers: patients sent, arrivals and no-shows, beds, admissions, discharges and transfers, shift gaps, length of stay. Agents and clinicians: their own work (`reports.test.ts`). Patients: the printable summary (FR 7.2). Checked in the browser at 1280 px |

---

## Use cases (64)

Source: the three use case tables in the SRS (Assignment 2 copy), read on 24 Oct 2026: 19 + 22 + 23 = 64.

### Patients and visitors (19)

| # | Use case | Actor | FR | Phase | Status |
|---|---|---|---|---|---|
| 1 | Use emergency screen | Visitor | 1.9 | 0–3 | Done |
| 2 | Log in with national ID | Patient | 1.1–1.8 | 0 | Done |
| 3 | Verify identity (included) | Mock NIDA | 1.1, 1.2, 1.10 | 0 | Done |
| 4 | Choose who is sick (extends Start a case) | Parent | 3.1 | 1 | Done |
| 5 | Start a case | Patient | 3.2, 3.10 | 1–3 | Done: started without a connection, it waits on the screen and starts when the connection returns |
| 6 | Share location (included) | Patient | 3.3–3.5 | 1 | Done |
| 7 | Check red flags (included) | Patient | 3.6, 4.1, 4.2 | 1 | Done |
| 8 | Describe symptoms (extends Start a case) | Patient | 3.7 | 1 | Done |
| 9 | Get AI triage (included) | AI service | 4.3–4.7 | 1 | Done |
| 10 | View routing result | Patient | 5.5 | 1 | Done |
| 11 | Request a call | Patient | 3.8, 3.9 | 1 | Done |
| 12 | Chat about the case | Patient, agent | 6.6 | 1 | Done |
| 13 | Send message notification (extends Chat) | Push service | 6.6, 1.8 | 3 | Done |
| 14 | Cancel a case | Patient | 3.11 | 1 | Done |
| 15 | Rate the help | Patient | 6.15 | 1 | Done |
| 16 | View records and prescriptions | Patient | 7.2 | 1 | Done |
| 17 | View children’s records (extends View records) | Parent | 1.3, 7.2 | 1 | Done |
| 18 | View activity list | Patient | 10.2 | 1 | Done |
| 19 | Check a prescription | Pharmacist, or anyone with the code | 11.7 | 1 | Done |

### Human agents and clinicians (22)

| # | Use case | Actor | FR | Phase | Status |
|---|---|---|---|---|---|
| 20 | Set agent status | Agent | 6.1 | 1 | Done |
| 21 | Accept offered case | Agent | 4.9, 6.2–6.4 | 1 | Done |
| 22 | Review and confirm triage | Agent | 6.5, 11.6 | 1 | Done |
| 23 | Pause case for urgent case | Agent | 6.12 | 1 | Done |
| 24 | Chat about the case | Agent, patient | 6.6, 6.8, 6.9 | 1 | Done |
| 25 | Call patient | Agent, patient | 6.7 | 1 | Done |
| 26 | Route patient | Agent | 5.2, 5.6, 5.7 | 1 | Done |
| 27 | Change routing (extends Route patient) | Agent | 5.10 | 1 | Done |
| 28 | Find suitable facilities (included) | System | 5.1, 5.3, 5.4, 5.8, 5.9 | 1 | Done |
| 29 | Assign attending clinician (included) | System | 5.12 | 1 | Done |
| 30 | Close a case | Agent | 6.15, 6.16 | 1 | Done |
| 31 | Issue prescription | Agent, clinician | 11.1, 11.2, 11.4 | 1 | Done |
| 32 | View my issued prescriptions | Agent, clinician | 11.5 | 1 | Done |
| 33 | Cancel prescription (extends View my issued prescriptions) | The issuer | 11.3 | 1 | Done |
| 34 | View incoming patients | Clinician | 7.4 | 1 | Done |
| 35 | Mark patient arrived | Clinician | 7.5, 7.6 | 1 | Done |
| 36 | Update patient record | Clinician | 7.7 | 1 | Done |
| 37 | Hand over patient | Clinician | 7.11 | 1 | Done |
| 38 | Discharge or complete visit | Clinician | 7.10 | 1 | Done |
| 39 | Assign bed | Clinician | 7.8 | 1 | Done |
| 40 | Transfer patient (extends Assign bed) | Clinician | 7.9 | 1 | Done |
| 41 | Mark unavailable for shift | Clinician | 8.5, 5.13 | 1 | Done |

### Staff, administration and timers (23)

| # | Use case | Actor | FR | Phase | Status |
|---|---|---|---|---|---|
| 42 | Log in as staff | Staff member | 2.1, 2.3, 2.5 | 0 | Done |
| 43 | Verify email code (included) | Email service | 2.2 | 0 | Done |
| 44 | Unlock account (extends) | Email service | 2.4 | 0 | Done |
| 45 | Reset password (extends) | Email service | 2.7 | 0 | Done |
| 46 | Set password from invitation | Staff member | 2.6 | 0 | Done |
| 47 | Send invitation (included) | Email service | 2.6 | 0 | Done |
| 48 | View reports | Staff member | 12.8 | 3 | Done |
| 49 | Manage capability profile | Facility manager | 8.1 | 1 | Done |
| 50 | Set bed capacity | Facility manager | 8.3 | 1 | Done |
| 51 | Manage clinician accounts | Facility manager | 8.2, 2.6 | 1 | Done |
| 52 | Prepare clinician schedule | Facility manager | 8.4 | 1 | Done |
| 53 | View staff activity | Facility manager, administrator | 10.3 | 1 | Done |
| 54 | Create facilities and staff accounts | Administrator | 12.1, 2.6 | 0–1 | Done |
| 55 | Deactivate account or change email | Administrator | 12.2, 12.3 | 1 | Done |
| 56 | Prepare agent schedule | Administrator | 12.4 | 1 | Done |
| 57 | Monitor on-duty agents | Administrator | 12.5 | 1 | Done |
| 58 | Manage red-flag list | Administrator | 12.6 | 1 | Partly: Kinyarwanda drafts written; native-speaker review pending |
| 59 | Switch AI on or off | Administrator | 4.8 | 1 | Done |
| 60 | Send alerts | Administrator, email service | 12.7 | 3 | Done |
| 61 | Escalate unaccepted case | System timer | 6.10, 6.11 | 3 | Done |
| 62 | Check agents are online | System timer | 6.13, 6.14 | 3 | Done |
| 63 | Expire routings and release beds | System timer | 5.7, 5.11 | 3 | Done |
| 64 | Reassign attending clinician | System timer | 5.13 | 3 | Done |

## Non-functional requirements (13)

| NFR | Quality | What is measured | Phase | Status |
|---|---|---|---|---|
| 1 | Data protection | HTTPS everywhere, data encrypted at rest (Supabase), Law No. 058/2021 | 4 | Partly: national ID stored only as a keyed hash; HTTPS comes with deployment |
| 2 | Authentication strength | 2FA, 15-minute sessions, both lock rules | 0 | Done (`auth.test.ts`) |
| 3 | Confidentiality | Role-based access, synthetic data and photos only, no identity sent to the AI | 0–1 | Done: role guards (`phase2.test.ts`), synthetic data, and no name, ID or location sent to the AI (FR 4.6, `cases.test.ts`) |
| 4 | Performance | 95% of common actions in 3 s on 3G; AI in 10 s; chat in 3 s | 3 | Partly: at the SRS's scale with 20 people at once, 95% of API answers in 15 to 77 ms; modelled on 3G, common actions take about 0.6 to 0.7 s; chat under 3 s and the AI limit of 10 s are tested; a first page visit is about 3 s on 3G, repeat visits about 1.5 s ([`docs/PERFORMANCE.md`](PERFORMANCE.md), `scale.test.ts`). Still to do: a check on a real phone over a real 3G line (phase 4) |
| 5 | Scalability | 1,000 patients a day, 50 facilities, 100 staff; more instances behind the load balancer | 3 | Partly: one instance handles 50 facilities, 100 staff and 30,000 requests a month with a wide margin (`scale.test.ts`); the dispatcher and timers already run once across instances. The live-update bus must move to Postgres LISTEN/NOTIFY before a second instance (phase 4) |
| 6 | Reliability | 99% a month; works without AI, GPS or connection | 3 | Partly: works without the AI (FR 4.7), without GPS (sector list, FR 3.4) and without a connection (FR 3.10, 1.9). The 99% monthly figure can only be measured once deployed (phase 4) |
| 7 | Usability | Kinyarwanda and English; a case in 3 minutes or less; "Prefer a call" | 3 | Partly: every patient and pharmacy screen in Kinyarwanda or English, chosen on any screen and kept on the record (red flags, notifications); dates with Kinyarwanda month names; screen readers told the language (`i18n.test.ts`, `cases.test.ts`); "Prefer a call" built. Waiting on: the native-speaker review of the drafts, and timing a case with real users (phase 4) |
| 8 | Compatibility | PWA on Chrome, Edge, Safari, Brave, phone and computer | 3 | Partly: installable (manifest, icons, service worker, Install button on Chrome, Edge and Android, Home Screen hint on iPhone), squircle fallback for Safari and Firefox; checked in Chromium only. Installing on a real iPhone and Android phone is part of the phase 4 device checks |
| 9 | Auditability | Logs complete, kept 5 years, never editable or deletable | 0–3 | Done: a database rule refuses any update or delete of `AuditEvent` (`phase2.test.ts`); nothing ever removes rows, so they are kept well beyond 5 years |
| 10 | Maintainability | Mock NIDA replaceable with little change; red flags and AI settings without code | 0–1 | Done: NIDA behind one client (`nida.client.ts`); red flags and the AI switch are edited on screens (`setup.test.ts`) |
| 11 | Ownership | Standard Node.js and PostgreSQL; works without AI | 0 | Done (stack) |
| 12 | Staffing | At least 1 agent online 24/7 through the schedule | 1–3 | Done: the agent schedule shows every shift with nobody on it (`setup.test.ts`); the on-duty dashboard flags scheduled agents who are Offline (`records.test.ts`); the administrator is alerted and emailed after 5 minutes with no agent online (`timers.test.ts`). Filling the schedule is the service's job |
| 13 | Notification privacy | Notifications never contain medical details | 3 | Done: every notification says only “You have a new message.”; proved by decrypting what the API sends, as a browser would (`push.test.ts`) |

## Browser checks

| Date | Screens | Widths | Modes |
|---|---|---|---|
| 24 Oct 2026 | Welcome, login (both steps and errors), patient home, emergency, staff login, code, invitation, staff home, staff accounts and the invite dialog | 375, 1280 | Native and fallback squircles |
| 25 Oct 2026 | Phase 3 batch E: reports (administrator, week) with real data | 1280 | Native |
| 24 Oct 2026 | Phase 3 batch D: welcome, login, home, a red-flag question in Kinyarwanda, and switching back | 375 | Native |
| 24 Oct 2026 | Phase 3 batch C: emergency page and a logged-in page with the web server stopped (production build); a request answered offline, then the connection restored | 375 | Native |
| 24 Oct 2026 | Phase 3 batch B: the notification opt-in on the patient's waiting screen (blocked state; the built-in browser refuses notifications) | 375 | Native |
| 24 Oct 2026 | Phase 3 batch A: administrator alerts, live alert pop-ups, the patient's no-agent screen | 1280 (alerts), 375 (patient) | Native |
| 24 Oct 2026 | Phase 2: patient home, records with QR, activity, print summary; agent case with prescribing; clinician patients, arrival and visit; my prescriptions and cancelling; pharmacy check (valid and “Do not dispense”); on-duty dashboard; FR 5.9 urgent screen | 375 (patient), 1280 (staff) | Native |
| 24 Oct 2026 | Phase 1 batch 3: agent queue, offer, case workspace (chat, triage review, routing), patient chat and confirmed routing | 1280 (agent), 375 (patient) | Native |
| 24 Oct 2026 | Phase 1 batch 2: patient home with open requests, who is sick, location (sector list), one red flag per screen, symptoms, waiting, urgent result, prefer a call, emergency nearest facility | 375 | Native |
| 24 Oct 2026 | Phase 1 batch 1: facilities, facility profile and beds, clinicians, schedule (both scopes), my shifts, red-flag list, settings | 375 (schedule, my shifts, nav), 1280 (all) | Native |
