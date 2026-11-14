# Demo video plan

The demo video shows **every one of the 106 functional requirements** in the SRS (section 4, revision 1.3) working on the live site, https://ubuzima.wilsonn.tech, for every user type, **including the night agent**. The full list of requirements and how each was tested is in [`FR-TEST-CHECKLIST.md`](FR-TEST-CHECKLIST.md); the table at the end of this file says in which scene each one appears.

**Length:** about 30 minutes once the waits are cut. Check the length limit on Canvas before recording. If it is shorter, keep every scene but speed up the typing parts (2x) and trim the talk; never drop a requirement. Put chapter timestamps in the video description so a marker can jump to any user type.

**Label every requirement on screen.** When a requirement is proven, show a small caption in a corner, for example `FR 6.3 Offer a case`. Add the captions while editing. This is what lets the marker tick each requirement off.

**What the rubric looks for, and where the video shows it:**

| Rubric line | Points | Shown in |
|---|---:|---|
| Reflections of system requirements: every user's functions from the SRS visible | 10 | Scenes 2 to 15: public, patient, agent (day and night), clinician (day and night), pharmacy, facility manager, administrator, and the automatic rules |
| Presentation video | 5 | The whole video: one clear story per user, with requirement captions |
| Code availability: public GitHub, clear setup | 5 | Scene 16: the repo, the README, the tests |
| Solution deployment: public URL | 5 | Every scene runs on https://ubuzima.wilsonn.tech, with the address bar visible |
| Operation: login, sign-up, buttons, redirects | 5 | Scenes 3, 7, 11 and 14: patient login, staff login with the code, invitation (staff sign-up), password reset, logout redirects |

## How the recording is split

Some requirements depend on the time of day or on time passing, so the video is recorded in **three sittings** and edited into one.

| Sitting | When (Kigali time) | What it is for |
|---|---|---|
| **0. Preparation** | The day before, before 12:00 | Starts the long timers (24 hours, 48 hours, 7 days) so the results are live on recording day. Not recorded, except where noted |
| **A. Day recording** | Recording day, 08:00 to 17:00 | Scenes 1 to 14 with the day agent (Diane) and the day clinicians |
| **B. Night recording** | Same day, 18:30 to 20:00 | Scene 15: the shift change at 19:00, the **night agent (Eric)** taking over, the night clinicians, and "no agent online" |

Kigali time is UTC+2. Day shifts run 07:00 to 19:00 and night shifts 19:00 to 07:00.

### Waiting times

No one should watch a 15-minute wait. Start each timer, carry on with another scene, and come back; in the edit, cut to the result with a caption such as "15 minutes later". Keep the computer clock visible in the corner (or the time in the page) so the wait is believable.

| Wait | Requirement | How to handle it |
|---|---|---|
| 30 seconds | FR 6.3 offer passes on | Show it whole (scene 15) |
| 60 seconds | FR 6.14 lost connection | Show it whole, or speed up 4x |
| 2 and 5 minutes | FR 6.10, 6.11, 6.13 | Speed up or cut |
| 10 minutes | FR 6.7, 6.9 | Start, cut, come back |
| 15 minutes | FR 1.6, 1.7, 1.8, 2.3, 2.5 | Start at the beginning of sitting A, come back later |
| 6 hours | FR 5.7 bed released | Route a case at 08:00 in sitting A; show it released at 14:00 or later |
| 24 hours | FR 5.11 routing expiry | Routed in sitting 0, shown expired in sitting A |
| 48 hours | FR 2.6 invitation expiry | Invitation sent two days before, shown expired and resent in sitting A |
| 7 days | FR 11.4 prescription expiry | Use a prescription issued at least 7 days before (the test round of 13 Nov 2026 issued several) |

Two things can't be switched on from the live site, because only the API may reach those services: the national ID service being down (FR 1.5) and the AI failing (FR 4.7). Scene 16 shows them with the automated tests that prove them.

## Before recording

### Accounts

- **Passwords:** all staff use the demo password in the README. **Type them yourself**, with the password field masked. Each login also needs the 6-digit code from https://ubuzima.wilsonn.tech/demo/inbox.
- **Patients** (README "Try it"), all made up:

| Person | National ID | Born | Name | Used for |
|---|---|---|---|---|
| Aline Uwase | 1 1992 7 0045823 1 16 | 14 Mar 1992 | Uwase | Main story: parent of Kevin (7) and Grace (3) |
| Jean Habimana | 1 1985 8 0067412 1 63 | 1 Jul 1985 | Habimana | Family model: Divine (11) and Ange (17) |
| Ange | 1 2009 7 0031504 1 28 | 21 May 2009 | Ange | Mature child: sees only herself |
| Eric (parent) | 1 2001 8 0054377 1 09 | 30 Sep 2001 | Eric | 3-day-old baby: Urgent with no questions |
| Claudine | 1 1996 7 0078215 1 35 | 18 Apr 1996 | Claudine | Pregnancy questions; 5-week-old baby |
| Mukamana | 1 1960 7 0012689 2 41 | 25 Dec 1960 | Mukamana | Lockout and call request |

- **Staff:**

| Who | Email | Shift |
|---|---|---|
| Day agent, Diane Umutoni | `agent@ubuzima.test` | Day |
| **Night agent, Eric Habineza** | `agent2@ubuzima.test` | Night |
| Day emergency clinician, Dr. Samuel Mugisha (Kacyiru) | `clinician@ubuzima.test` | Day |
| Day general medicine clinician, Dr. Yvette Uwamahoro (Kacyiru) | `gp@ubuzima.test` | Day (handover in scene 8) |
| Night emergency clinician, Dr. Alice Mukarwego (Kacyiru) | `er.night@ubuzima.test` | Night |
| Day mental health clinician, Dr. Olivier Habyarimana (Kibagabaga) | `kib.mh.day@ubuzima.test` | Day |
| Remera clinician, Josiane Mukeshimana | `remera@ubuzima.test` | Day (receives the transfer) |
| Managers | `manager@` (Kacyiru), `manager2@` (Kibagabaga), `manager3@` (Remera) | |
| Administrator, Patrick Nkurunziza | `admin@ubuzima.test` | |

### Screen setup

- **Patient:** Chrome in phone view (375 px), or a real phone mirrored to the screen. Allow notifications once, so the push message in scene 5 shows.
- **Staff:** a normal Chrome window (1280 px or wider). A **second Chrome profile** (or a private window) for the second staff member when two are on screen at once.
- **A tab on the demo inbox.**
- Record at 1920×1080 or higher, browser zoom 110%.

### Sitting 0: the day before

1. Check the schedule runs past recording day: `node scripts/demo-schedule.mjs 12`.
2. **FR 5.11:** log in as a patient (Mukamana), ask for help with a bed-needing problem, and as Diane route it to Kacyiru. Don't mark arrival. Write down the case code.
3. **FR 2.6:** as the administrator, invite a made-up agent (for example `video.agent@ubuzima.test`). Don't open the invitation.
4. **FR 11.4:** find a prescription code at least 7 days old (Prescriptions list, or the record of a test patient) and one cancelled code. Write both down.
5. **FR 5.13:** as the Kacyiru manager, put Dr. Alice (`er.night@`) on **recording day's Day shift** as well, so two emergency clinicians are on duty and one can take over from the other. Remove it after recording.
6. Make sure no open cases are left over: close them as the agent.

### Sitting A: first thing in the morning

1. Diane and every clinician you will use are on the schedule today (admin **On duty**).
2. No open cases from rehearsals; Diane is Offline, Eric is Offline.
3. Check the AI switch is **on** (admin Settings).

## Scenes

Each scene lists the requirements it proves. Say out loud what the screen is proving, in one sentence, then move on.

### Sitting A (day)

#### 1. The problem and the first screen (about 1 minute)
- **Say:** "In Rwanda, patients often go to the wrong facility or wait too long for urgent care. UbuzimaConnect lets a patient describe the problem on a phone; a health agent, helped by an AI suggestion, sends them to the right facility, where a bed and a clinician are waiting."
- Welcome page. Switch to **Kinyarwanda** and back.

#### 2. Public: no account (about 2 minutes)
- **Emergency** without logging in: the 912 button and the nearest facility with emergency care and a clinician on duty. **FR 1.9**
- Type a patient page and a staff page in the address bar: each sends you to login. Only Emergency and `/check` open without an account. **FR 9.6**
- Leave the pharmacy check (FR 11.7) for scene 9, when there is a fresh prescription.

#### 3. Patient login and identity (about 3 minutes)
- **Start the lockout timer first:** with Mukamana's ID, enter a wrong name 5 times. Locked for 15 minutes, with the Emergency button. **FR 1.6** (come back in scene 10)
- Aline: right ID, **wrong date of birth**, then **wrong name**: refused, with a plain message. A made-up ID: refused. **FR 1.2, FR 1.4**
- Aline logs in properly: the ID is checked with the national ID service first. **FR 1.1**
- Tick **This is not my device** before logging in. Later, log out: nothing about her stays on screen and no notifications are set up on that device. **FR 1.8**
- Home: Aline, Kevin and Grace. **FR 1.3**
- Her record shows the **photo** from the identity record. **FR 1.10**
- Jean logs in in the other window: he sees himself, Ange (17) and Divine (11). Ange logs in herself and sees **only her own** record. Divine (11) has no ID to log in with. **FR 1.3**
- As Ange, paste Divine's record address: refused. **FR 9.1**
- **Start the idle timer:** leave Jean's window untouched. **FR 1.7** (come back in scene 10)

#### 4. Patient asks for help (about 3 minutes)
- Aline: **Get help → Who is sick?** shows Aline, Kevin and Grace; Ange's account goes straight to her own case. **FR 3.1**
- Kevin. **Use my location**: taken from the device GPS. **FR 3.3**
- The **danger-sign checklist**: all questions for a 7-year-old on one screen, grouped, "None of these" last. **FR 3.6**
- "None of these", then describe: free text, how long (today, 1 to 3 days...), how bad (1 to 10). **FR 3.7**
- No phone number was asked. **FR 3.9**
- The AI returns a category, urgency, confidence and reason in seconds; the case gets its triage level and goes to the agent queue. **FR 4.3, FR 4.4, FR 4.9**
- Tap **Get help → Kevin** again: the open case opens instead of a new one. **FR 3.2**
- In DevTools → Application → Local storage, show the 5 nearest facilities saved, with name, distance, services and phone. **FR 3.5** (they are used offline in scene 6)
- Grace: refuse location. The **Province, District, Sector** picker appears. **FR 3.4**
- Grace's description: only two words, "tummy pain". It goes to the agent as **Uncertain**, never Minor. **FR 4.5**

#### 5. Day agent: queue, chat, triage and routing (about 5 minutes)
- Diane logs in: password, then a **wrong code** (refused), then the code from the inbox. **FR 2.1, FR 2.2**
- Before she goes Available, create three waiting cases in mixed order: Minor (a plain description), Uncertain (Grace, above) and Urgent (next bullet). They will be offered **Urgent first, then Uncertain, then Minor**, oldest first in each. **FR 6.2**
- Claudine, as the Urgent one: "Are you pregnant?" Yes, so the pregnancy questions appear. She answers **Yes** to a pregnancy danger sign: the checklist stops, the case is Urgent without the AI, and at once she sees the nearest suitable facility, its distance, 912 and "An agent will contact you." **FR 3.6, FR 4.1, FR 5.5**
- Diane: status **Available** (one status at a time; Away and Offline also there). The offer arrives with its 30-second countdown; she accepts and becomes **Busy** by herself. **FR 6.1, FR 6.3**
- While handling it, she can't take another case. **FR 6.4**
- **The case:** the photo, the danger sign, the AI result with its reason (labelled as a suggestion), and the full history with past prescriptions. She changes the category and bed-needed; each change is saved with her name and time. **FR 6.5, FR 1.10, FR 11.6**
- **Needed service** pre-selected from the rules (pregnancy: maternity); she could change it. **Bed needed** shows Yes (danger sign). **FR 5.1, FR 5.2**
- **Routing:** only active facilities with that service on duty and a free bed, nearest first. She picks a farther one: a reason is required. Confirms: valid 24 hours, **bed reserved**, the on-duty maternity clinician with the fewest patients assigned and notified. **FR 5.3, FR 5.4, FR 5.6, FR 5.7, FR 5.12**
- **Chat** with Aline's case later (Minor): messages both ways within 3 seconds, quick replies Yes, No, Better, Worse; with Aline's app in the background, a push notification with no medical details. **FR 6.6**
- **Change the routing** of Claudine's case to another facility: the old routing is cancelled, its bed freed, gone from the old facility's incoming list. **FR 5.10**
- Close Claudine's case as **Routed to facility**, with a note (required). The patient is asked to **rate the help** 1 to 5. **FR 6.15**
- Paste Claudine's record address as Diane: refused now the case is closed. **FR 9.2**
- Mark the time: the **bed timer** for FR 5.7 starts now (see scene 13).

#### 6. Agent: other ways a case can go (about 5 minutes)
- **Minor case handled remotely:** Diane gives advice in the chat and **issues a prescription** (medicine, dose, how often, days, instructions; no approval). Each prescription has its own code and QR code, the prescriber's name and licence, and is valid 7 days. Close as handled remotely. **FR 6.8, FR 11.1, FR 11.2**
- **My prescriptions:** her issued list (patient, medicines, date, status); she cancels one. **FR 11.5**
- **Patient not responding:** a Minor case where the patient stops answering; after 10 minutes it can be closed as "No response" with final advice. Try on an Urgent case: not allowed. **FR 6.9** (start, cut, come back)
- **Prefer a call:** Mukamana (after her lock ends) or another patient taps **Prefer a call** on the home screen: a number and whose it is ("Family member"). The case says "Call requested". Diane sees the number and owner, checks the date of birth first, enters a danger sign "Yes" from the call: the case turns Urgent. A call note is required. With a second call request, log 3 unanswered attempts: after 10 minutes it closes as **No response**, and the patient gets the in-app message. **FR 3.8, FR 6.7**
- **Pause for an urgent case:** Diane is Busy on a Minor case when an Urgent case waits 2 minutes; the alert reaches all agents (Busy too) and the administrator. She pauses her case and takes the Urgent one; her paused case goes to the front, and its patient sees "Your agent was called to an emergency. Another agent will continue." **FR 6.10, FR 6.12**
- Leave another Urgent case unaccepted for **5 minutes**: the administrator is emailed (show the demo inbox), an Uncertain patient now sees the nearest suitable facility and 912, and the alert repeats every 2 minutes as one refreshed alert. **FR 6.11**
- **Lost connection:** Diane closes her browser while handling a case. After 60 seconds she is Offline, the case goes back to the front of its level with its history, and the patient sees "Another agent will continue with you." **FR 6.14**
- **Patient cancels:** on an open case with a reserved bed, the patient taps **I no longer need help**. Closed as "Cancelled by patient", the agent is told, the bed is freed. **FR 3.11**
- **Agent reports:** own cases, outcomes, handling time, ratings; day, week, month; download. **FR 12.8**

#### 7. Clinician: from arrival to discharge (about 5 minutes)
- Dr. Samuel logs in. **Patients → On the way**: a summary only (triage level, service, danger signs, symptoms, age, sex, photo), no name or full record. Paste the full record address before arrival: refused. **FR 7.4, FR 9.3**
- **Mark arrived** after comparing the photo; once more with "doesn't match": can't be marked arrived, and the problem is recorded. The visit opens and the reserved bed becomes the patient's. **FR 7.5**
- **Full access** while he is the attending clinician; Dr. Yvette (another window) can't open it. **FR 7.6**
- **Write a record entry**, then edit it: author and time saved, the earlier version kept. **FR 7.7**
- **Assign a bed:** free beds go down by one. **FR 7.8**
- **Prescription** from the visit, same fields as the agent's; the full prescription history shows. **FR 11.1, FR 11.6**
- **Cancel** his own prescription; try to cancel the agent's: not allowed. **FR 11.3**
- **Hand over** to Dr. Yvette: she is now attending and notified; he loses access. **FR 7.11**
- Dr. Yvette **discharges**: the bed is freed (free beds up by one), full access ends, and she can no longer edit the record. **FR 7.10, FR 7.7**
- **Clinician reports:** own patients, visits, prescriptions; filter and download. **FR 12.8**

#### 8. Clinician: no bed, transfer, unavailable (about 3 minutes)
- With no free bed at Kacyiru (the manager sets total beds to the number in use, scene 12), **Assign bed** refuses and offers **Transfer**. **FR 7.8**
- **Transfer:** the nearest suitable facility with a bed (Remera) is found, a bed reserved, a clinician assigned, the patient appears in Remera's incoming list, and the Kacyiru visit closes as "Transferred". **FR 7.9**
- Josiane at Remera marks arrival and opens the record: it holds the Kacyiru entries too, one central record. **FR 7.1, FR 7.3**
- **Mark unavailable:** Dr. Olivier (Kibagabaga, mental health, day) marks himself unavailable for today's shift. **FR 8.5**
  - A patient describes a mental health problem: no active facility has mental health on duty, so the case is Urgent and the patient sees 912 and "An agent will contact you." **FR 5.9**
- **Automatic reassignment:** route an emergency case to Kacyiru (Dr. Samuel or Dr. Alice is assigned, whoever has fewer patients). Before the patient arrives, that clinician marks unavailable: the other emergency clinician is assigned at once and notified, and it is logged. **FR 5.13**
- **Newborn:** Eric (parent) asks for help for his 3-day-old baby: Urgent at once, no questions. **FR 4.2**

#### 9. Patient records and the pharmacy (about 3 minutes)
- Aline: **Records**: Kevin's prescription with its QR code, the visit and the clinician's notes, an expired prescription still there; **Print summary** downloads. **FR 7.2, FR 11.4**
- **Activity:** every action on her and her children's records, by anyone: date, time, who, role, and Phone or Computer for logins. **FR 10.2, FR 10.1**
- **Pharmacy, `/check`** (no login): the fresh code shows **Valid**, patient name, medicines, dose, days, prescriber and licence, issue date, and no ID number or diagnosis. Scan its QR code with a phone. Then the cancelled code ("Do not dispense"), the 7-day-old one (Expired, "Do not dispense") and a made-up code ("Prescription not found"). **FR 11.7, FR 11.3, FR 11.4**

#### 10. Coming back to the timers (about 1 minute)
- Jean's idle window: back at login. **FR 1.7**
- Mukamana: unlocked after 15 minutes, logs in. **FR 1.6**
- The "not my device" window: nothing left on screen. **FR 1.8**

#### 11. Staff accounts and safety (about 3 minutes)
- **Wrong password 5 times** as Dr. Yvette: locked 15 minutes. **FR 2.3**
- 5 more wrong tries: stays locked until the **unlock code** from the email is entered; the administrator has no unlock button. **FR 2.4**
- **Forgot password:** the emailed link, a new password, logged in. **FR 2.7**
- **Staff idle timeout:** a staff window left 15 minutes goes back to login. **FR 2.5**
- **Invitation from sitting 0:** expired after 48 hours; send a new one; open it from the inbox and set a password (staff sign-up). **FR 2.6**

#### 12. Facility manager (about 3 minutes)
- Olivier (Kacyiru): **Profile:** services, level of care, location. Set Remera **inactive** (as manager3) and show it is not used for routing; then active again. **FR 8.1, FR 5.3**
- **Clinicians:** create, edit, deactivate one (kept, not deleted); another facility's clinician is not listed. **FR 8.2**
- **Beds:** change the total; a total below beds in use plus reserved is refused. Set total = in use, for scene 8. **FR 8.3**
- **No free bed anywhere:** with every suitable facility full, a bed-needing case shows the nearest as "No beds currently available", and the agent is alerted at once. Restore the beds afterwards. **FR 5.8**
- **Weekly schedule:** Day and Night shifts, unavailability shown, uncovered shifts flagged. **FR 8.4**
- Paste a patient record address: refused. **FR 9.4**
- **Reports:** incoming, arrivals and no-shows, bed occupancy, admissions, discharges, transfers, shift coverage, average stay; download CSV. **FR 12.8**

#### 13. The 6-hour bed (about 30 seconds)
- The routing from the morning, never arrived: after 6 hours the bed is free again. **FR 5.7**

#### 14. Administrator (about 4 minutes)
- **Create** a facility, a manager and an agent with a licence number; invitations sent. **FR 12.1**
- **Deactivate** an agent who has an active case: the account is kept, and the case goes back to the front of its level. **FR 12.2**
- **Change a staff email**, then ask for a reset link: it goes to the new address. **FR 12.3**
- **Agent schedule:** Day and Night shifts for the week (Diane days, Eric nights). **FR 12.4**
- **Red-flag list:** add, edit, remove a question in both languages; a new case shows the change, an older case doesn't. **FR 12.6**
- **Settings: AI switch off**; a new case goes to the queue as Uncertain; switch it back on. **FR 4.8**
- **Alerts:** escalation, no capacity, the delay incidents from scene 6. **FR 12.7**
- **Activity:** every user's actions. Then, as Olivier, his own staff only. **FR 10.3, FR 10.1**
- **Routing expired** (from sitting 0): the case left Kacyiru's incoming list after 24 hours, with the entry in the activity log. **FR 5.11**
- Paste a patient record address: refused. **FR 9.5**
- **Reports** for the month; download. **FR 12.8**
- **Log out:** the confirmation, then the redirect to login.

### Sitting B (night)

#### 15. Night shift: the night agent takes over (about 5 minutes)
Start at about 18:45 Kigali time.
- **18:45:** Diane (day) is handling a case. A patient also waits.
- **19:00, the shift changes.** Administrator, **On duty**: every agent with their status and how long they've had it; Eric is scheduled now but **Offline**, so his row is highlighted. **FR 12.5**
- **Eric logs in** (password, code from the inbox) and chooses **Available**. **FR 2.1, FR 6.1**
- Diane tries to go **Away**: blocked while she has a case. She **releases** it: it goes to the front of its level and is offered to Eric, who accepts. **FR 6.16, FR 6.3**
- **Offer passes on:** with both Available, a new case is offered to the one free longest; let the 30-second countdown run out: it moves to the other agent. Only one can accept. **FR 6.3**
- Diane goes **Offline** and her shift is over.
- **Night routing:** Eric routes an emergency case to Kacyiru: the night clinician, **Dr. Alice** (`er.night@`), is assigned, not the day clinician. She logs in and sees the patient on the way. **FR 5.12, FR 7.4**
- **No agent online:** Eric goes **Offline**. Three patients ask for help (Urgent, Uncertain, Minor): each sees the message for their level, the Urgent one with the nearest facility and 912. After 5 minutes the administrator gets the alert, by email too because a case is waiting. **FR 6.13, FR 12.7**
- Eric comes back Available and takes them, Urgent first. **FR 6.2**

#### 16. The code and the rules that need hours (about 2 minutes)
- **GitHub:** the README (setup, deployment, known limitations), and `docs/TRACEABILITY.md`, which ties every requirement to its test.
- Run the automated tests (`pnpm test`): **202 tests pass**. Point at the tests for what can't be shown live:
  - national ID service down: "Verification is temporarily unavailable" **FR 1.5**
  - no name, ID or location sent to the AI **FR 4.6**
  - AI failing: Uncertain, skipped for 1 minute after 3 failures, administrator alerted after more than 5 **FR 4.7**
  - the 6-hour, 24-hour, 48-hour and 7-day rules, the same as shown live **FR 5.7, 5.11, 2.6, 11.4**
- **Say:** "Every requirement in the SRS is built, tested by script and by hand on the live site, and shown in this video. The Kinyarwanda texts are a draft waiting for a native speaker's review."

#### 17. Offline (can be recorded in sitting A, after scene 4) (about 1 minute)
- Chrome DevTools → Network → **Offline** in the middle of a case: the input is kept, "Not sent yet: waiting for connection", the saved facilities marked "Availability not confirmed" with 912. Back online: sent by itself. Once more offline, answer a danger sign **Yes**: "Call 912 and go to the nearest health facility". **FR 3.10**
- Emergency page offline: the saved list. **FR 1.9**

## Every requirement and its scene

| FR | Requirement | Scene |
|---|---|---|
| 1.1 | Verify national ID | 3 |
| 1.2 | Knowledge-based check | 3 |
| 1.3 | Family access model | 3 |
| 1.4 | Reject invalid access | 3 |
| 1.5 | Verification unavailable | 16 (test) |
| 1.6 | Lock after failed attempts | 3, 10 |
| 1.7 | Patient session timeout | 3, 10 |
| 1.8 | Shared device option | 3, 10 |
| 1.9 | Emergency without login | 2, 17 |
| 1.10 | Identity photo | 3, 5 |
| 2.1 | Staff login | 5, 15 |
| 2.2 | Two-factor authentication | 5 |
| 2.3 | Temporary lock | 11 |
| 2.4 | Email unlock | 11 |
| 2.5 | Staff session timeout | 11 |
| 2.6 | Staff invitation | 11, 16 |
| 2.7 | Password reset | 11 |
| 3.1 | Choose who is sick | 4 |
| 3.2 | One open case per person | 4 |
| 3.3 | Capture current location | 4 |
| 3.4 | Manual location fallback | 4 |
| 3.5 | Save nearby facilities | 4 |
| 3.6 | Red-flag checklist | 4, 5 |
| 3.7 | Submit symptoms | 4 |
| 3.8 | Prefer a call | 6 |
| 3.9 | Phone number not required | 4 |
| 3.10 | Work offline | 17 |
| 3.11 | Cancel a case | 6 |
| 4.1 | Red-flag override | 5 |
| 4.2 | Automatic urgency for newborns | 8 |
| 4.3 | Categorise issue | 4 |
| 4.4 | Set triage level | 4 |
| 4.5 | Escalate uncertainty | 4 |
| 4.6 | Protect identity | 16 (test) |
| 4.7 | AI unavailable | 16 (test) |
| 4.8 | AI switch | 14 |
| 4.9 | Human review of every case | 4 |
| 5.1 | Choose needed service | 5 |
| 5.2 | Bed needed | 5 |
| 5.3 | Match to capable facility | 5, 12 |
| 5.4 | Rank by proximity | 5 |
| 5.5 | Immediate guidance for urgent cases | 5 |
| 5.6 | Confirm routing | 5 |
| 5.7 | Reserve bed | 5, 13 |
| 5.8 | No free bed | 12 |
| 5.9 | No matching facility | 8 |
| 5.10 | Change routing | 5 |
| 5.11 | Routing expiry | 14 |
| 5.12 | Assign attending clinician | 5, 15 |
| 5.13 | Automatic reassignment | 8 |
| 6.1 | Agent status | 5, 15 |
| 6.2 | Queue order | 5, 15 |
| 6.3 | Offer a case | 5, 15 |
| 6.4 | One active case | 5 |
| 6.5 | Review and confirm | 5 |
| 6.6 | Chat with patients | 5 |
| 6.7 | Call patients | 6 |
| 6.8 | Handle minor cases remotely | 6 |
| 6.9 | Patient not responding | 6 |
| 6.10 | Escalation level 1 | 6 |
| 6.11 | Escalation level 2 | 6 |
| 6.12 | Pause for an urgent case | 6 |
| 6.13 | No agent online | 15 |
| 6.14 | Lost connection | 6 |
| 6.15 | Close a case (and the patient's rating) | 5 |
| 6.16 | End of shift | 15 |
| 7.1 | Store records | 8 |
| 7.2 | Patient view of records | 9 |
| 7.3 | Retrieve across facilities | 8 |
| 7.4 | Incoming patients | 7, 15 |
| 7.5 | Mark arrival | 7 |
| 7.6 | Attending clinician access | 7 |
| 7.7 | Update record after care | 7 |
| 7.8 | Assign bed | 7, 8 |
| 7.9 | Transfer patient | 8 |
| 7.10 | Discharge patient | 7 |
| 7.11 | Hand over patient | 7 |
| 8.1 | Manage capabilities | 12 |
| 8.2 | Manage clinician accounts | 12 |
| 8.3 | Set bed capacity | 12 |
| 8.4 | Weekly schedule | 12 |
| 8.5 | Mark unavailable | 8 |
| 9.1 | Patient access | 3 |
| 9.2 | Agent access | 5 |
| 9.3 | Clinician access | 7 |
| 9.4 | Facility manager access | 12 |
| 9.5 | Administrator access | 14 |
| 9.6 | Public access | 2 |
| 10.1 | Log access | 9, 14 |
| 10.2 | Patient activity list | 9 |
| 10.3 | Staff activity | 14 |
| 11.1 | Issue prescription | 6, 7 |
| 11.2 | Prescription code | 6 |
| 11.3 | Cancel prescription | 7, 9 |
| 11.4 | Keep after expiry | 9, 16 |
| 11.5 | My issued prescriptions | 6 |
| 11.6 | Prescription history | 5, 7 |
| 11.7 | Prescription check page | 9 |
| 12.1 | Create accounts | 14 |
| 12.2 | Deactivate accounts | 14 |
| 12.3 | Change staff email | 14 |
| 12.4 | Agent schedule | 14 |
| 12.5 | On-duty dashboard | 15 |
| 12.6 | Manage red-flag list | 14 |
| 12.7 | Alerts | 14, 15 |
| 12.8 | Reports (agent, clinician, manager, administrator) | 6, 7, 12, 14 |

**106 requirements, all in the video.** FR 1.5, 4.6 and 4.7 are shown through the automated tests, because the live services that would need to fail can't be reached from outside; everything else is shown live.

## After recording

- Close every open case, set every staff member Offline, and restore the bed totals and any facility made inactive.
- Reactivate or leave the accounts deactivated for the video (they are listed last).
- Run `node scripts/live-check.mjs` once to confirm the live site is still healthy.
