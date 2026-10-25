# Test plan and results

Every scenario in the *UbuzimaConnect Full System Description* (sections 8 and 9), how it is tested, and the result on 25 October 2026.

**Two kinds of proof:**

- **Live:** `node scripts/live-check.mjs` plays each role (patient, agent, clinician, facility manager, administrator, pharmacist) against the deployed site, https://ubuzima.wilsonn.tech and https://api.ubuzima.wilsonn.tech, and prints PASS or FAIL per check. It uses only the made-up demo people and `@ubuzima.test` accounts, and cancels or closes what it opens. Sections: `A`, `B`, `C` (agent, routing, clinician, pharmacy), `F` (managers and administrators), `N` (no agent online), `X` (timed flows, about 4 minutes).
- **Automated:** `pnpm test` (120 API tests, 31 web tests, 21 shared tests). These cover the rules that need the clock moved: 15-minute timeouts, 24-hour expiry, 6-hour bed release, NIDA outages, AI failures.

**Where the Full System Description and the SRS disagree, the SRS is followed,** because it is the later document:

| Full System Description | SRS (and the app) |
|---|---|
| B3: red-flag questions one by one | FR 3.6 (revised 25 Oct): all on one screen |
| D5, E5: full records unlock for the facility's clinicians | FR 7.6: for the attending clinician only |
| 11.1: AI provider is the Claude API | 3.3: Gemini API |
| F3: "copy last week" on the schedule | FR 8.4: weekly schedule, no copy (not built) |
| C4: quick-reply buttons Yes, No, Better, Worse | Built as in the description |

## Results

**Live run:** 102 checks, all passing after the fixes below (the last full run: 101, plus one check corrected for an ID my earlier runs had locked). **Automated:** 172 tests, all passing.

| ID | Scenario | SRS | How tested | Result |
|---|---|---|---|---|
| A1 | Parent logs in | FR 1.1–1.6, 1.9 | Live: login, children listed, wrong details refused with attempts left, unknown ID refused, 5 wrong attempts lock the ID, HttpOnly + Secure cookie | ✅ |
| A1 | NIDA unavailable | FR 1.5 | Automated (`auth.test.ts`) | ✅ |
| A1 | 15 minutes without activity | FR 1.7 | Automated (`auth.test.ts`, added today) | ✅ |
| A2 | Mature child logs in | FR 1.3, 9.1 | Live: Ange (17) sees only herself, can't open another family's records | ✅ |
| A3 | Emergency without login | FR 1.9 | Live: page opens, nearest emergency facility with distance; automated: nothing created | ✅ |
| A4 | Records and access history | FR 7.2, 10.2 | Live: own and child's records, visit, entries, prescriptions; access history lists every view | ✅ |
| A5 | Borrowed or shared device | FR 1.8 | Live: notifications refused, nothing served after logout | ✅ |
| B1 | Choosing who is sick | FR 3.1, 3.2 | Live: a second request opens the existing case | ✅ |
| B2 | Sharing the location | FR 3.3–3.5 | Live: 5 nearest facilities returned; empty sector refused | ✅ |
| B3 | Red-flag checklist | FR 3.6, 4.1, 4.2, 5.1 | Live: child gets 18 signs, pregnant woman 17, baby under 2 months gets N1, baby under 8 days Urgent with no questions, a tapped sign is Urgent with the facility and 912 | ✅ |
| B4 | Symptoms and AI triage | FR 3.7, 4.3 | Live: triaged in 1.5 s (limit 10 s) | ✅ |
| B5 | Uncertain triage | FR 4.5 | Live: under 5 words is Uncertain; automated: low confidence, no answer | ✅ |
| B6 | AI unavailable | FR 4.6–4.8 | Live: AI switched off, case still queued, no error, switched back on; automated: circuit breaker after 3 failures, alert after 5 in 5 minutes | ✅ |
| B7 | "Prefer a call" | FR 3.8, 4.5(e) | Live: from home and during the chat | ✅ |
| B8 | Losing connection | FR 3.10 | Automated (outbox, web tests); in the browser: Chrome offline mode | ✅ |
| B9 | Patient cancels | FR 3.11 | Live | ✅ |
| C1 | Agent starts a shift | FR 2.1–2.3, 6.1 | Live: password + emailed code, Available; 5 wrong passwords lock the account | ✅ |
| C2 | Offer and accept | FR 6.3, 6.4 | Live: offered within seconds, 30-second offer, second accept refused; automated: passes to the next agent, times out | ✅ |
| C3 | Agent reviews the case | FR 6.5, 1.10 | Live: full case, photo, red-flag answers, triage change saved | ✅ |
| C4 | Chat | FR 6.6, NFR 4 | Live: message delivered in 0.3 s (limit 3 s), patient replies | ✅ |
| C5 | Calling the patient | FR 6.7 | Live: call note; automated: date of birth required for another's number, 3 missed calls close as No response | ✅ |
| C6 | Remote advice and prescription | FR 11.1–11.3, 11.5 | Live: code RX-XXXX-XXXX, listed under "my prescriptions", cancel shows Do not dispense | ✅ |
| C7 | Routing | FR 5.6, 5.7, 5.12 | Live: nearest first, attending clinician of the right specialty, bed held, patient sees the facility | ✅ |
| C8 | Escalation | FR 6.10, 6.11 | Live: level 1 alert at 134 s (rule: 2 minutes), seen as a toast on the administrator's screen | ✅ |
| C9 | No agent online | FR 6.13 | Live: Uncertain patient sees the nearest facility and 912; automated: administrator alerted after 5 minutes | ✅ |
| C10 | Agent loses connection | FR 6.14 | Live: case back in the queue after 57 s (rule: 60 s without a signal) | ✅ |
| C11 | Pausing for an emergency | FR 6.12 | Live: refused before a level 1 alert; automated: paused case back at the front | ✅ |
| C12 | Closing and rating | FR 6.15 | Live: outcome and note, agent loses access, patient rates 5 | ✅ |
| C13 | Agent ends a shift | FR 6.15 | Live: can't go Away while Busy; released case back in the queue | ✅ |
| D1 | Finding suitable facilities | FR 5.3, 5.4 | Live: suitable only with the specialty on duty and a free bed, nearest first | ✅ |
| D2 | No free bed | FR 5.8 | Automated (`triage.test.ts`: falls back to the nearest marked "no beds"; `timers.test.ts`: no-capacity alert) | ✅ |
| D3 | No facility offers the service | FR 5.9 | Automated: Urgent, 912, no-capacity alert | ✅ |
| D4 | Incoming patient | FR 7.4 | Live: listed, summary only, no national ID | ✅ |
| D5 | Patient arrives | FR 7.5, 7.6 | Live: Arrived, attending clinician opens the records, a colleague can't | ✅ |
| D6 | Patient never arrives | FR 5.11 | Automated: expired after 24 hours, bed released, off the list | ✅ |
| D7 | Different facility | FR 7.6 | By design: that facility has no routing, so nothing to open (known limitation) | ✅ |
| E1 | Clinician logs in | FR 2.1, 2.2 | Live | ✅ |
| E2 | Record entry | FR 7.7 | Live: entry, new version on update, refused after the visit ends | ✅ |
| E3 | Prescription during a visit | FR 11.1 | Live | ✅ |
| E4 | Assigning a bed | FR 7.8, 7.9 | Live; automated: no free bed offers a transfer | ✅ |
| E5 | Discharge | FR 7.11 | Live: visit ends, the clinician's access ends | ✅ |
| E6 | Marking unavailable | FR 8.5, 5.13 | Live; automated: patients on the way move to a colleague | ✅ |
| F1 | Facility profile | FR 8.1, 8.3 | Live: profile and beds; automated: inactive facility never routed, total below occupied refused | ✅ |
| F2 | Clinician accounts | FR 8.2, 2.6 | Live: Kacyiru's manager added 6 clinicians through invitations | ✅ |
| F3 | Weekly schedule | FR 8.4 | Live: schedule with gaps; "copy last week" is not in the SRS and not built | ✅ |
| G1 | Facilities, managers, agents | FR 12.1, 12.2, 2.6 | Live: invitation emailed, link works once, account deactivated and kept | ✅ |
| G2 | Red-flag list | FR 12.6 | Live: 23 questions, only the administrator; automated: edits apply to new cases only | ✅ |
| G3 | Monitoring and alerts | FR 12.7, 12.8, 4.8 | Live: alerts, AI switch, reports (triage levels, wait for an agent, ratings, no-capacity, AI failures), CSV download | ✅ |
| H1 | Pharmacy check | FR 11.7 | Live: Valid with medicines, prescriber and licence; no ID or diagnosis; unknown code "not found"; cancelled shows Do not dispense; the QR code decodes to the check page | ✅ |
| I1 | Background timers | NFR, FR 5.11, 6.10 | Automated (`timers.test.ts`); live: escalation and lost connection above | ✅ |
| I2 | Logging | FR 10.1, NFR 9 | Live: activity log; automated: entries can't be edited or deleted (database rule) | ✅ |
| 9.1 | Child can't breathe at 2 a.m. | – | Live run C (same steps, Emergency care at Kacyiru) | ✅ |
| 9.2 | Student with a rash | – | Live runs B4 and C6 | ✅ |
| 9.3 | Elderly man who can't type | – | Live B7 and C5 | ✅ |
| 9.4 | AI down and no free beds | – | Live B6 and C8; automated D2 | ✅ |

## What the testing found, and what was fixed

| Found | Fix |
|---|---|
| **The demo schedule ran out on Sunday 25 Oct.** It was seeded for one week only, with one clinician per specialty, so from Monday nobody was on duty and routing would find no facility. During the day no paediatrician was on duty anywhere, so a child couldn't be routed. | Kacyiru's manager added a partner for each specialty and every manager filled 12 weeks of shifts, through the app (`scripts/demo-schedule.mjs`, D69). Kibagabaga and Remera keep their night gaps for the coverage report. |
| The staff sidebar's logo ran past the sidebar's edge. | Wordmark 18 px tall in the sidebar. |
| The pharmacy check page was blank while it loaded. | "Checking the prescription…" while it loads. |
| A schedule test failed on Sundays (it looked for a later day in the same week). | It now schedules tomorrow and looks in that week. |
| The patient's 15-minute timeout had no test. | Test added. |

## Not testable here

These need people or devices, and are for Wilson to do: the 3-minute usability test with a new patient (NFR 7), real 3G and real phones (NFR 4, 8), the Kinyarwanda review, and the 99% monthly uptime (NFR 6), which needs a month of monitoring.
