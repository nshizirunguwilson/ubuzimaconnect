# Final Project video: script and shot list

**One video, about 9 minutes 15 seconds, never more than 9:45** (the brief allows 5 to 10). In this order: what the system is, the problem, why it is a problem, the solution and its design, a demo, the live site, and the close.

The demo doesn't try to show every requirement. It follows **one patient from "my son is sick" to a bed at a facility that can treat him**, and adds only the features that prove the solution is safe, works around the clock, and holds up when things go wrong.

## How it is made

1. **Your voice:** you record each clip below, word for word, as its own audio file. This is the only thing you do.
2. **The demo (clips 03 to 08):** recorded by script on a **local copy** of the system (the same code as the live site), so every login, code and ID is typed by the script. Each account has its own browser window, so several accounts can be on screen at once.
3. **The live site (clip 09):** recorded by script on https://ubuzima.wilsonn.tech, with the address bar showing. Only pages that need no login.
4. **The slides:** exported from the deck "UbuzimaConnect | Your Health on Time" (already updated on 19 Nov).
5. **The edit:** each shot is fitted to your clip. A small label names each requirement as it appears, for example `FR 6.3 Offer a case`.

No long waits are needed. The one wait in the demo (an urgent case left for 2 minutes) is filmed for real and cut, with a "2 minutes later" label. The night shift is recorded with the local copy's clock at 18:59 Kigali time.

## Recording your voice

- One file per clip, named exactly as below (for example `03-patient.m4a`). Voice Memos or QuickTime is fine.
- Quiet room, phone or headset microphone about a hand's width from your mouth.
- Calm pace, about 140 words a minute. The times are a guide: the video is fitted to your voice.
- Leave one second of silence at the start and end of each file.
- If you stumble, record that clip again. You can change words so they sound like you; keep the meaning.
- Put the files in `video/voice/` inside the project folder (not pushed to GitHub).

## Overview

| Clip | Time | Part | Screen | Words |
|---|---|---|---|---:|
| 00 | 0:00 to 0:20 | What the system is | Slides | 43 |
| 01 | 0:20 to 1:20 | The problem, and why it is a problem | Slides | 130 |
| 02 | 1:20 to 2:05 | The solution and the design | Slides | 93 |
| 03 | 2:05 to 3:40 | Demo: patient | Local | 155 |
| 04 | 3:40 to 5:20 | Demo: health agent, day and night | Local | 173 |
| 05 | 5:20 to 6:20 | Demo: clinician | Local | 92 |
| 06 | 6:20 to 6:45 | Demo: emergency page and pharmacy | Local | 36 |
| 07 | 6:45 to 7:15 | Demo: facility manager | Local | 41 |
| 08 | 7:15 to 7:55 | Demo: administrator | Local | 48 |
| 09 | 7:55 to 8:40 | The live site | Live | 51 |
| 10 | 8:40 to 9:15 | Testing, limits and close | Slides | 67 |

About 930 words: roughly 6.5 minutes of speech, plus pauses on the screens. That leaves 30 seconds of room under 9:45.

---

## 00 · What the system is (0:00 to 0:20) · `00-intro.m4a`

**Say:**

> Hello, I'm Wilson Nshizirungu, and this is UbuzimaConnect: a connected patient record and triage system for Rwanda. A patient asks for help on a phone, a health agent checks the case, and the patient is sent to a facility that can receive them.

**Screen:** title slide.

---

## 01 · The problem, and why it is a problem (0:20 to 1:20) · `01-problem.m4a`

**Say:**

> In Rwanda, many patients travel to the wrong facility, or arrive too late. The trip costs time and money, and when the facility has no free bed or no doctor for that problem, the patient travels again.
>
> Digital care has worked here before. Babyl served about two point eight million people, one in five Rwandans. But it was owned abroad, and when its parent company failed in 2023, it closed overnight. Over a thousand respiratory and malaria cases went back to facilities that weren't ready for them.
>
> e-Ubuzima keeps national records, but only in fifteen of thirty districts so far, and nothing in it checks how urgent a case is or finds a facility with space.
>
> So the gap is getting the right patient to the right place, in time.

**Screen:** Problem Context slide, then the Evidence slide with its four numbers (2.8M, Overnight, 1,055 + 246, 15 districts).

---

## 02 · The solution and the design (1:20 to 2:05) · `02-solution.m4a`

**Say:**

> UbuzimaConnect is my solution. It has six kinds of users: patients, health agents, clinicians, facility managers, administrators, and pharmacies.
>
> The main process is simple. Danger signs are checked first. Then an AI suggests how urgent the case is, and a trained health agent always decides. The agent sends the patient to the nearest facility with the right service, a free bed and a clinician on duty, and the bed is held for them.
>
> The website runs on Vercel, and the API, the database and a mock national ID service run together in Azure.

**Screen:** Objectives slide, then the System Design slide, then the deployment diagram (`docs/srs/deployment-diagram.png`).

---

## 03 · Demo: patient (2:05 to 3:40) · `03-patient.m4a`

**Say:**

> Let's follow a patient. Aline logs in with her national ID, her date of birth and one name, checked against the national ID service. There's no password to forget. Wrong details are refused, and five wrong tries lock the ID.
>
> As a parent, she sees her children too. Her son Kevin is sick. She picks him and shares her location.
>
> First come the danger signs, all on one screen. She answers none of these, then describes the problem, how long, and how bad. The AI suggests a level, and the case goes straight to a health agent.
>
> If she had answered yes to a danger sign, the case would be urgent at once, and she'd see the nearest facility with emergency care and the emergency number, without waiting for anyone.
>
> And with no internet, the request is kept on the phone and sent as soon as she's back online, while the nearest facilities still show.

**Screen (patient in phone view, 375 px):**

| Shot | What happens | Labels |
|---|---|---|
| 3.1 | Login: ID in six boxes, date of birth, name; logged in | FR 1.1 Verify national ID · FR 1.2 Knowledge-based check |
| 3.2 | Wrong name: a plain message; the fifth wrong try: "locked for 15 minutes", with the Emergency button | FR 1.4 Reject invalid access · FR 1.6 Lock after failed attempts |
| 3.3 | Home: Aline, Kevin and Grace | FR 1.3 Family access model |
| 3.4 | Get help → Who is sick? → Kevin; Use my location | FR 3.1 Choose who is sick · FR 3.3 Capture current location |
| 3.5 | Danger-sign checklist on one screen; "None of these" | FR 3.6 Red-flag checklist |
| 3.6 | Description, how long, how bad; sent; the AI result | FR 3.7 Submit symptoms · FR 4.3 Categorise issue · FR 4.4 Set triage level |
| 3.7 | Claudine answers "Yes": Urgent at once, nearest facility with distance, 912, "An agent will contact you" | FR 4.1 Red-flag override · FR 5.5 Immediate guidance |
| 3.8 | Offline: "Not sent yet" and the saved facilities; back online: sent | FR 3.10 Work offline · FR 3.5 Save nearby facilities |

---

## 04 · Demo: health agent, day and night (3:40 to 5:20) · `04-agent.m4a`

**Say:**

> Now the health agent. Staff log in with a password and a code sent by email. Diane goes Available, and cases are offered one at a time, urgent first. Each offer waits thirty seconds, then moves to the next agent.
>
> Diane sees the whole case: the danger signs, the AI's suggestion and its reason. She decides, not the AI. She can change anything, and every change is saved with her name. She chats with Aline live.
>
> Kevin needs a bed. The system lists only facilities with the right service, a free bed and a clinician on duty, nearest first. Diane confirms, and the bed is held. If every facility is full, she's alerted at once.
>
> If nobody takes an urgent case within two minutes, every agent and the administrator are alerted.
>
> And care doesn't stop at night. At seven in the evening, Eric takes over. Diane releases her open case, and it goes to him. If no agent is online at all, patients are told what to do, and the administrator is alerted.

**Screen (agent in a desktop window; Aline's phone view beside it when both are shown):**

| Shot | What happens | Labels |
|---|---|---|
| 4.1 | Diane logs in: password, then the code from the demo inbox | FR 2.1 Staff login · FR 2.2 Two-factor authentication |
| 4.2 | Available; Kevin's case offered with the 30-second countdown; urgent offered before minor | FR 6.1 Agent status · FR 6.2 Queue order · FR 6.3 Offer a case |
| 4.3 | The case: danger signs, AI result and reason; the level changed and saved with her name and the time | FR 6.5 Review and confirm · FR 4.9 Human review of every case |
| 4.4 | Chat both ways (split screen with Aline's phone) | FR 6.6 Chat with patients |
| 4.5 | Routing: service pre-selected, bed needed Yes, only capable facilities, nearest first; confirmed, bed reserved, clinician assigned | FR 5.1 Choose needed service · FR 5.3 Match to capable facility · FR 5.4 Rank by proximity · FR 5.6 Confirm routing · FR 5.7 Reserve bed · FR 5.12 Assign attending clinician |
| 4.6 | Every facility full: "No beds currently available" and the alert | FR 5.8 No free bed |
| 4.7 | An urgent case nobody takes: "2 minutes later", the alert to all agents and the admin | FR 6.10 Escalation level 1 |
| 4.8 | 18:59 → 19:00 Kigali time: Eric logs in and goes Available; Diane can't go Away with a case, releases it; Eric accepts | FR 6.16 End of shift |
| 4.9 | Eric goes Offline: the patient sees what to do; the admin's alert | FR 6.13 No agent online |

---

## 05 · Demo: clinician (5:20 to 6:20) · `05-clinician.m4a`

**Say:**

> At the facility, the clinician on duty sees who is coming, but only a summary, until the patient arrives. The clinician compares the identity photo and marks Kevin arrived. The held bed is now his, and only now does the clinician open his full record.
>
> The clinician writes the visit into the record and issues a prescription with its own code.
>
> When a facility has no free bed, the patient is transferred to the nearest one that has, and the record goes with him. When he's discharged, the bed is free again.

**Screen (clinician in a desktop window):**

| Shot | What happens | Labels |
|---|---|---|
| 5.1 | Patients → On the way: summary only; the full record refused before arrival | FR 7.4 Incoming patients · FR 9.3 Clinician access |
| 5.2 | Compare the photo, Mark arrived; the full record opens | FR 7.5 Mark arrival · FR 7.6 Attending clinician access |
| 5.3 | A record entry and a prescription with its code and QR | FR 7.7 Update record after care · FR 11.1 Issue prescription · FR 11.2 Prescription code |
| 5.4 | Transfer: the patient appears at Remera, with the Kacyiru entries in the record | FR 7.9 Transfer patient · FR 7.3 Retrieve across facilities |
| 5.5 | Discharge: free beds go up by one | FR 7.10 Discharge patient |

---

## 06 · Demo: emergency page and pharmacy (6:20 to 6:45) · `06-public.m4a`

**Say:**

> Some things need no account at all. Anyone can open the emergency page: the emergency number and the nearest facility with emergency care. And a pharmacist checks Kevin's prescription by its code: valid, cancelled, or expired.

**Screen:**

| Shot | What happens | Labels |
|---|---|---|
| 6.1 | The emergency page without logging in | FR 1.9 Emergency without login |
| 6.2 | `/check`: Kevin's code, valid, with medicines and prescriber; then a cancelled and an expired code | FR 11.7 Prescription check page |

---

## 07 · Demo: facility manager (6:45 to 7:15) · `07-manager.m4a`

**Say:**

> The facility manager keeps the facility's information true, because routing depends on it: its services, its number of beds, and a weekly schedule of day and night shifts, where gaps are flagged. The manager sees reports, but never a patient's record.

**Screen:**

| Shot | What happens | Labels |
|---|---|---|
| 7.1 | Profile: services and level of care | FR 8.1 Manage capabilities |
| 7.2 | Beds: total changed | FR 8.3 Set bed capacity |
| 7.3 | Weekly schedule with the uncovered shifts flagged | FR 8.4 Weekly schedule |
| 7.4 | Reports; a patient record address refused | FR 12.8 Reports · FR 9.4 Facility manager access |

---

## 08 · Demo: administrator (7:15 to 7:55) · `08-admin.m4a`

**Say:**

> The administrator runs the system. New staff get an email invitation to set their own password. The administrator plans the agents' shifts, so there's always someone on duty, manages the danger-sign questions in both languages, and can switch the AI off. Every action by every user is logged.

**Screen:**

| Shot | What happens | Labels |
|---|---|---|
| 8.1 | Create an agent; the invitation in the inbox | FR 12.1 Create accounts · FR 2.6 Staff invitation |
| 8.2 | Agent schedule: Diane days, Eric nights; On duty now | FR 12.4 Agent schedule · FR 12.5 On-duty dashboard |
| 8.3 | Danger-sign list in English and Kinyarwanda | FR 12.6 Manage red-flag list |
| 8.4 | AI switch off: a new case goes to the queue as Uncertain | FR 4.8 AI switch |
| 8.5 | Activity log | FR 10.1 Log access |

---

## 09 · The live site (7:55 to 8:40) · `09-live.m4a`

**Say:**

> Everything you've just seen runs live, here at ubuzima dot wilsonn dot tech. This is the real deployment: the website on Vercel, and the API and database in Azure. Anyone can open the emergency page, check a prescription, or log in with the demo accounts listed in the README on GitHub.

**Screen (Chrome with the address bar, https://ubuzima.wilsonn.tech, no logins):**

| Shot | What happens |
|---|---|
| 9.1 | The home page, scrolled slowly |
| 9.2 | The patient login page and the staff login page (shown, not used) |
| 9.3 | The emergency page with the nearest facility |
| 9.4 | `/check` with a real prescription code from the live site: valid |

---

## 10 · Testing, limits and close (8:40 to 9:15) · `10-close.m4a`

**Say:**

> I tested every functional requirement, by script and by hand for each user, and fixed what I found. Two hundred and three automated tests pass, and the AI never receives a name, an ID or a location.
>
> The limits: the Kinyarwanda needs a native speaker's review, and the national ID service is a mock.
>
> The code is public on GitHub, and the system is live. Thank you.

**Screen:** Testing slide, the test run passing (with the AI privacy test named), Conclusion slide, then the Thank You slide with the GitHub link added below it in the edit.

| Shot | Labels |
|---|---|
| 10.1 | FR 4.6 Protect identity |

---

## Why these requirements

The video shows **58 of the 106** requirements, chosen because each one proves part of the solution:

| What it proves | Requirements shown |
|---|---|
| The right person, without a password or paperwork | FR 1.1, 1.2, 1.3, 1.4, 1.6, 2.1, 2.2, 2.6 |
| Safe triage: danger signs before the AI, and a person always decides | FR 3.6, 3.7, 4.1, 4.3, 4.4, 4.8, 4.9, 5.5, 6.5, 12.6 |
| The right place: a facility with the service, a free bed and a clinician | FR 5.1, 5.3, 5.4, 5.6, 5.7, 5.8, 5.12, 8.1, 8.3 |
| In time, day and night | FR 6.1, 6.2, 6.3, 6.10, 6.13, 6.16, 8.4, 12.4, 12.5 |
| The record follows the patient, and only the right people see it | FR 7.3, 7.4, 7.5, 7.6, 7.7, 7.9, 7.10, 9.3, 9.4, 4.6, 10.1 |
| Works for Rwanda's conditions: phones, weak internet, no account | FR 1.9, 3.1, 3.3, 3.5, 3.10, 6.6, 11.1, 11.2, 11.7, 12.1, 12.8 |

The other 48 work too: they are listed in `docs/FR-TEST-CHECKLIST.md`, tested by script and by hand.

## The system design in the video

- **Actors:** the six user types are named in clip 02, and five get their own demo part (03 to 08); pharmacies appear in 06.
- **Main process:** clip 02 states it, and the demo follows Kevin through it in order: patient (03), agent (04), clinician (05), pharmacy (06).
- **Architecture and deployment:** the System Design slide and the deployment diagram in clip 02, and the live site in clip 09.

## Recording sittings (all done by script)

| Sitting | Where | Clips |
|---|---|---|
| A | Local copy, clock as normal | 03 to 08, except 4.8 and 4.9 |
| B | Local copy, clock set to 18:59 Kigali time | 4.8, 4.9 |
| C | Live site | 09 |
| D | Slides exported as 4K images | 00, 01, 02, 10 |
