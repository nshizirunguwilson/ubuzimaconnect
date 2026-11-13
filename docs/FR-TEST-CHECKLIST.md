# Functional requirements test checklist

Every functional requirement in the latest SRS (section 4, revision 1.3, 11 November 2026): **106 requirements in 12 groups**, sorted by the user type that carries each one out. Each requirement appears once, under its main user; where another user is involved too, the row says so.

**Status:** approved and run on 13 November 2026. **First run: 108 of 109 rows worked, FR 5.8 only in part. After the fixes the same day: all 109 rows work** (105 of 105 live checks, 200 of 200 automated tests). Notes and what was fixed are at the end.

**What was run:** the 103-check live script (103 passed); the automated tests (199 passed: 133 API, 34 website, 28 shared, 4 mock NIDA); about 80 extra live checks written for this round, including two timed runs of about 20 minutes each; and the patient screens by hand in a phone-sized browser. Staff screens were first tested through the API only; the same evening every staff role was also tested on screen, with you typing the passwords (see "On-screen testing" below).

## How each test is run

| Code | Method |
|---|---|
| **Live** | Done by hand on the live site, https://ubuzima.wilsonn.tech, in a browser (phone size for patients, desktop for staff), with screenshots |
| **Script** | Also covered by `node scripts/live-check.mjs` (103 checks); still re-checked by hand |
| **Wait** | Done live, but needs real waiting time (for example 15 minutes of no activity) |
| **Clock** | The wait is too long to sit through (6 hours, 24 hours, 48 hours, 7 days), so it's proven with the automated tests that move the clock (`pnpm test`), plus a live check of the visible part |

Only made-up demo people from the mock NIDA and `@ubuzima.test` staff accounts are used. Codes arrive in the demo inbox.

**Result column:** ☐ not run yet · ✅ works · ❌ doesn't work (with a note).

## Count by user type

| User type | Rows to test |
|---|---|
| 1. Public (no account) | 3 |
| 2. Patient (parent, mature child) | 25 |
| 3. All staff (sign-in and accounts) | 7 |
| 4. Agent | 26 |
| 5. Clinician | 13 |
| 6. Facility manager | 6 |
| 7. Administrator | 11 |
| 8. System (automatic, no one presses a button) | 18 |
| **Total** | **109 rows covering all 106 requirements** |

Rows and requirements differ slightly: reports (FR 12.8) have a row for each of the four staff types, closing a case (FR 6.15) and issuing a prescription (FR 11.1) have two parts, and FR 7.1, 7.3 and 10.1 share one end-to-end row.

---

## 1. Public (no account)

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 1.9 | Emergency without login | Open the first screen without logging in, tap Emergency. Then turn the network off and open it again, on a device that started a case earlier | 912 button and the nearest active facility with emergency care and a clinician on duty; no case created. Offline: 912 button and the saved facility list | Live, Script | ✅ 912 and nearest emergency facility; offline page cached; with no GPS shows saved list |
| FR 9.6 | Public access | Without logging in, try the patient, staff and admin pages directly by address | Only the Emergency screen and the prescription check page open; everything else asks for login | Live | ✅ every patient and staff page sends a logged-out visitor to login; API refuses 7 protected routes |
| FR 11.7 | Prescription check page | Enter a valid code, scan its QR code, then try an expired, a cancelled and a made-up code | Status, patient name, medicines, dose, duration, prescriber and licence, issue date; "Do not dispense" for expired or cancelled; "Prescription not found" for unknown; no national ID or diagnosis; each check logged | Live, Script | ✅ live check |

## 2. Patient (parent and mature child)

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 1.1 | Verify national ID | Log in with a demo national ID | ID checked against the mock NIDA before anything is shown | Live, Script | ✅ |
| FR 1.2 | Knowledge-based check | Log in with the right ID but a wrong date of birth, then a wrong name | Access only when both date of birth and one name match | Live | ✅ wrong date of birth and wrong name both refused |
| FR 1.3 | Family access model | Log in as a parent, then as a child aged 16 or more, then try a child under 16 | Parent sees self and all children; mature child sees only self; young child can't log in alone | Live, Script | ✅ Jean sees himself, Ange (17) and Divine (11) |
| FR 1.4 | Reject invalid access | Use an ID not in NIDA, and wrong details | Access denied with a plain message saying what went wrong | Live, Script | ✅ "Check the date of birth and the name, and try again." (see note A, fixed) |
| FR 1.5 | Verification unavailable | Switch the mock NIDA outage on, then try to log in | "Verification is temporarily unavailable" with the Emergency button; failure logged | Live | ✅ automated test (NIDA outage) |
| FR 1.6 | Lock after failed attempts | Enter wrong details 5 times for one ID | ID locked for 15 minutes, Emergency button shown | Live, Script, Wait | ✅ locked, then works again after 15 minutes |
| FR 1.7 | Patient session timeout | Log in and leave the app untouched for 15 minutes | Session ends, back to login | Wait | ✅ session ended after 15 idle minutes |
| FR 1.8 | Shared device option | Tick "This is not my device", log in, log out (and once more: wait 15 minutes) | No notifications on that device; nothing about the patient left visible | Live, Script, Wait | ✅ option shown; push refused; nothing left after 15 minutes |
| FR 1.10 | Identity photo | Open own record as a patient (also check the agent's and clinician's screens, sections 4 and 5) | Photo from the identity record shown to the patient, the handling agent, and clinicians on incoming, arrival and record screens | Live | ✅ demo people have a silhouette as their identity photo |
| FR 3.1 | Choose who is sick | Start a case as a parent, then as a mature child | Parent sees "Who is sick?" with self and children; mature child goes straight to own case | Live, Script | ✅ |
| FR 3.2 | One open case per person | With a case open, start another for the same person | The open case opens instead of a new one | Live | ✅ |
| FR 3.3 | Capture current location | Start a case and allow location | Location taken from the device GPS | Live | ✅ GPS stored; button shown |
| FR 3.4 | Manual location fallback | Start a case and refuse location | Province, District and Sector picker; centre of the sector used | Live, Script | ✅ Province, District, Sector picker |
| FR 3.5 | Save nearby facilities | Start a case, then check the device's saved data | 5 nearest facilities saved with name, distance, services and phone | Live, Script | ✅ 5 saved with name, distance, services, phone |
| FR 3.6 | Red-flag checklist | Start cases for different ages and sexes (adult man, woman aged 12 to 55 who is pregnant, young child) | All questions for that age and sex on one screen, grouped as in Appendix C; "None of these" after the last one; pregnancy questions only for a pregnant woman aged 12 to 55 | Live, Script | ✅ one screen, grouped, None of these last |
| FR 3.7 | Submit symptoms | Answer "None of these", then describe the problem | Free text, duration choice (today, 1 to 3 days, 4 to 7 days, more than a week), severity 1 to 10 | Live, Script | ✅ |
| FR 3.8 | Prefer a call | Tap "Prefer a call" on the home screen and in the chat | Asks for "A number we can call you on" and whose it is (Mine, Family member, Someone else); from home it creates a case marked "Call requested" | Live, Script | ✅ live check |
| FR 3.9 | Phone number not required | Use every patient feature without giving a number | Number asked only for "Prefer a call", and saved for that case only | Live | ✅ |
| FR 3.10 | Work offline | Go offline in the middle of a case, then come back online; once more answer a red flag "Yes" while offline | Input kept, "Not sent yet: waiting for connection", saved facilities marked "Availability not confirmed" with 912; sent on reconnect; offline "Yes" shows "Call 912 and go to the nearest health facility" | Live | ✅ exact messages offline; sent by itself when back online |
| FR 3.11 | Cancel a case | Tap "I no longer need help" on an open case with a bed reserved | Closes as "Cancelled by patient", agent notified, bed released | Live, Script | ✅ closed as Cancelled by patient |
| FR 5.5 | Immediate guidance for urgent cases | Answer a red flag "Yes" | At once: nearest suitable facility, distance, 912 button and "An agent will contact you." | Live | ✅ facility, distance, 912, "An agent will contact you." |
| FR 6.15 (patient part) | Rate the help | After the agent closes the case | Patient asked to rate 1 to 5 | Live | ✅ live check |
| FR 7.2 | Patient view of records | Open records as a parent (own and child's), including an expired prescription; download the summary | All records visible at any time, expired prescriptions included; printable summary downloads | Live, Script | ✅ records, activity and print summary open |
| FR 9.1 | Patient access | As a mature child, try a sibling's or parent's record address | Refused; only the family model applies | Live, Script | ✅ live check |
| FR 10.2 | Patient activity list | Open the activity list as a parent, for self and a child | Every action on the records, by anyone, with date, time, who, what, and device type for logins | Live, Script | ✅ date, time, who, role, Phone or Computer |

## 3. All staff (agent, clinician, facility manager, administrator)

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 2.1 | Staff login | Log in once as each staff role with email and password | Each role reaches its own home | Live, Script | ✅ |
| FR 2.2 | Two-factor authentication | Log in, use the emailed code; try a wrong code and a code older than 5 minutes | Only the correct, fresh code lets them in | Live, Wait | ✅ wrong code and 5-minute-old code refused |
| FR 2.3 | Temporary lock | Enter a wrong password 5 times | Account locked for 15 minutes | Live, Script, Wait | ✅ locked, then works after 15 minutes |
| FR 2.4 | Email unlock | 5 more wrong attempts after the lock; then use the emailed unlock code; check the admin can't unlock | Stays locked until the unlock code (valid 15 minutes) is entered; no admin unlock button | Live | ✅ locked until the emailed unlock code; no admin unlock |
| FR 2.5 | Staff session timeout | Log in and leave it untouched for 15 minutes | Session ends | Wait | ✅ ended after 15 idle minutes |
| FR 2.6 | Staff invitation | Admin or manager creates an account; open the invite; check a resend after 48 hours | Invitation email to set a password, valid 48 hours; a new one can be sent after it expires | Live, Script, Clock | ✅ 48-hour expiry: automated test |
| FR 2.7 | Password reset | Tap "Forgot password", use the emailed link | Password changed, new one works | Live | ✅ |

## 4. Agent

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 5.1 | Choose needed service | Make cases that hit each rule (red flag, pregnancy, child under 12, injury, chest pain, mental health, other); agent changes it | Right service pre-selected each time; agent can change it | Live, Script | ✅ |
| FR 5.2 | Bed needed | Look at a red-flag routing and a normal one; change the value | Always "Bed needed: Yes" or "No"; red flags start at Yes; agent can change it | Live | ✅ |
| FR 5.6 | Confirm routing | Confirm the suggested facility; then pick a farther one | Confirm works; a reason is required for a non-nearest choice; routing valid 24 hours | Live, Script | ✅ |
| FR 5.10 | Change routing | Change the facility of a confirmed routing | Old routing cancelled, its bed released, gone from the old facility's incoming list, new routing started | Live | ✅ old facility no longer lists the patient |
| FR 5.12 | Assign attending clinician | Route a case; then pick a clinician of another specialty | Suggests the on-duty clinician of that specialty with the fewest active patients; a reason is needed for another specialty; the clinician is notified | Live, Script | ✅ |
| FR 6.1 | Agent status | Switch between Available, Away, Offline; accept a case | One status at a time; Busy set automatically while handling | Live, Script | ✅ |
| FR 6.2 | Queue order | Create Minor, Uncertain and Urgent cases in mixed order | Urgent first, then Uncertain, then Minor; oldest first in each | Live | ✅ offered Urgent, then Uncertain, then Minor |
| FR 6.3 | Offer a case | Two agents Available; create a case; let 30 seconds pass without accepting | Offered to the agent free longest; after 30 seconds to the next; only one can accept | Live, Script | ✅ |
| FR 6.4 | One active case | While handling a case, try to take another | Refused | Live, Script | ✅ |
| FR 6.5 | Review and confirm | Open a case; change triage level, category, service, bed needed | Full case, photo, AI result and reason, full history with prescriptions; each change saved with name and time | Live, Script | ✅ |
| FR 6.6 | Chat with patients | Send messages both ways, use quick replies, put the patient's app in the background | Delivered within 3 seconds and saved; quick replies Yes, No, Better, Worse; push notification with no medical details | Live, Script | ✅ message arrived in under 3 seconds |
| FR 6.7 | Call patients | Take a call request with someone else's number; enter red flags for the patient; make 3 unanswered attempts | Number and owner shown; date of birth check before medical talk; red flag "Yes" makes it Urgent; call note required; after 3 misses in 10 minutes closes as "No response" with the in-app message | Live, Script, Wait | ✅ 3 missed calls: automated test |
| FR 6.8 | Handle minor cases remotely | Give advice in the chat and issue a prescription | Case handled without routing | Live | ✅ |
| FR 6.9 | Patient not responding | Minor case, patient silent 10 minutes; also try on an Urgent case | Minor can be closed "No response" with final advice; Urgent and Uncertain can't | Wait | ✅ Urgent and Uncertain refused; Minor refused before 10 minutes |
| FR 6.10 | Escalation level 1 | Leave an Urgent case unaccepted for 2 minutes | All agents (Busy too) and the administrator alerted in the system | Wait, Script | ✅ |
| FR 6.11 | Escalation level 2 | Leave it unaccepted for 5 minutes | Admin emailed; Uncertain patient sees the nearest suitable facility and 912; alerts repeat every 2 minutes; delay incident logged | Wait | ✅ admin alerted and emailed at 5 minutes; repeats every 2 minutes |
| FR 6.12 | Pause for an urgent case | While Busy on a Minor case, a level 1 alert arrives; pause and take it | Paused case goes to the front of its level; its patient sees "Your agent was called to an emergency. Another agent will continue." | Live, Script, Wait | ✅ |
| FR 6.13 | No agent online | All agents Offline; create Urgent, Uncertain and Minor cases; wait 5 minutes | Each patient sees the right message; admin alerted after 5 minutes | Wait, Script | ✅ |
| FR 6.14 | Lost connection | Agent with a case closes the browser for 60 seconds | Agent goes Offline; case back to the front of its level with history; patient sees "Another agent will continue with you." | Wait, Script | ✅ Offline after 58 seconds |
| FR 6.15 | Close a case | Close cases with each outcome; check access afterwards | One outcome and a note required; automatic closures write their own note; agent loses access to the records | Live, Script | ✅ |
| FR 6.16 | End of shift | While handling a case, try to go Away or Offline; then release the case | Blocked until closed or released; released case goes to the front of its level | Live | ✅ Away refused while handling |
| FR 9.2 | Agent access | Open a patient's record address after the case closes, and for a case not theirs | Refused; access only while handling that case | Live, Script | ✅ |
| FR 11.1 (agent part) | Issue prescription | Issue one during an active case | Medicine, dose, how often, days, instructions; no approval needed | Live, Script | ✅ |
| FR 11.5 | My issued prescriptions | Open the list; cancel one from it | Patient name, medicines, date, status; own valid ones can be cancelled (agent and clinician) | Live, Script | ✅ |
| FR 11.6 | Prescription history | Open a returning patient's case (and, as clinician, an active visit) | Full prescription history shown, only during the case or visit | Live | ✅ |
| FR 12.8 (agent part) | Agent reports | Open reports, filter day, week, month, download | Own cases, outcomes, handling time, ratings | Live, Script | ✅ |

## 5. Clinician

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 7.4 | Incoming patients | As an on-duty clinician at the routed facility, open Incoming | Summary only: triage level, service, red flags, symptoms, age, sex, photo | Live, Script | ✅ |
| FR 7.5 | Mark arrival | Mark "Arrived" after comparing the photo; once more record a mismatch | Visit starts, reserved bed becomes theirs; a mismatch can't be marked Arrived and the issue is recorded | Live, Script | ✅ reserved bed became the patient's |
| FR 7.6 | Attending clinician access | Open the record as the attending clinician, as another clinician, and after the visit ends | Full access only for the attending clinician during the visit | Live, Script | ✅ |
| FR 7.7 | Update record after care | Add an entry, edit it, then try after the visit ends | Author and time saved; edits keep old versions; no edits after the visit | Live, Script | ✅ |
| FR 7.8 | Assign bed | Assign a free bed; then try with none free | Free bed count goes down by 1; with none free it refuses and offers a transfer | Live, Script | ✅ refused with "Transfer the patient" |
| FR 7.9 | Transfer patient | Transfer a patient when no bed is free | Nearest suitable facility with a bed found, bed reserved, clinician assigned, incoming there, visit closed "Transferred" | Live | ✅ moved to Remera Health Centre with a bed and clinician |
| FR 7.10 | Discharge patient | Discharge one patient with a bed; complete a visit without one | Bed freed (count up by 1); full access ends | Live | ✅ available beds +1 after discharge |
| FR 7.11 | Hand over patient | Hand over to another on-duty clinician at the same facility | New clinician attending and notified; old one loses access; logged | Live, Script | ✅ |
| FR 8.5 | Mark unavailable | Mark self unavailable for a shift, then route a case | Routing skips them at once | Live, Script | ✅ |
| FR 9.3 | Clinician access | Try a full record of an incoming patient before arrival, and one from another facility | Only the summary for incoming at own facility | Live | ✅ full record refused before arrival |
| FR 11.1 (clinician part) | Issue prescription | Issue one during an active visit | Same fields as the agent's; no approval needed | Live, Script | ✅ |
| FR 11.3 | Cancel prescription | Cancel own prescription; try to cancel someone else's (agent too) | Only the issuer can cancel; cancelled shows "Do not dispense" | Live, Script | ✅ |
| FR 12.8 (clinician part) | Clinician reports | Open reports, filter, download | Own patients, visits, prescriptions | Live | ✅ |

## 6. Facility manager

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 8.1 | Manage capabilities | Edit services, level of care, location; set the facility inactive and route a case | Saved; an inactive facility is not used for routing | Live, Script | ✅ |
| FR 8.2 | Manage clinician accounts | Create, edit and deactivate a clinician; try another facility's clinician | Works for own facility only; deactivated accounts kept | Live, Script | ✅ |
| FR 8.3 | Set bed capacity | Change total beds; try a number below occupied plus reserved | Available count calculated; too-low total refused | Live, Script | ✅ |
| FR 8.4 | Weekly schedule | Build a week of Day and Night shifts; leave a service uncovered | Unavailability shown; uncovered shifts flagged | Live, Script | ✅ |
| FR 9.4 | Facility manager access | Try any patient record address | Refused; only own facility's profile, beds, schedule, accounts and reports | Live, Script | ✅ |
| FR 12.8 (manager part) | Manager reports | Open reports, filter, download | Incoming, arrivals and no-shows, bed occupancy, admissions, discharges, transfers, shift coverage, average stay | Live, Script | ✅ |

## 7. Administrator

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 4.8 | AI switch | Switch the AI off, create a case, switch it back on | While off, every case goes to the queue as Uncertain | Live, Script | ✅ |
| FR 9.5 | Administrator access | Try any patient record address | Refused; accounts, schedules, settings, alerts, reports and logs only | Live, Script | ✅ |
| FR 10.3 | Staff activity | Admin opens activity of all users; a manager opens their own staff's | Each sees exactly their scope | Live | ✅ |
| FR 12.1 | Create accounts | Create a facility, a manager and an agent (with licence) | All created, invitations sent | Live, Script | ✅ |
| FR 12.2 | Deactivate accounts | Deactivate an agent who has an active case | Account kept, not deleted; the case returns to the front of its level | Live, Script | ✅ |
| FR 12.3 | Change staff email | Change an email, then request an unlock code and a reset link | Both go to the new address | Live | ✅ reset link went to the new address only |
| FR 12.4 | Agent schedule | Build a week of agent Day and Night shifts | Saved and shown | Live | ✅ |
| FR 12.5 | On-duty dashboard | Open it with some scheduled agents Offline | Every agent, scheduled or not, status and time in it; scheduled Offline agents highlighted | Live | ✅ |
| FR 12.6 | Manage red-flag list | Add, edit, remove a question in both languages; check an old and a new case; try as another role | Only admin can; applies to new cases only; logged | Live, Script | ✅ |
| FR 12.7 | Alerts | Trigger an escalation, no agent online, no capacity, AI failure | Admin sees an alert for each | Live, Script | ✅ see note C |
| FR 12.8 (admin part) | Admin reports | Open each report, filter day, week, month, download | All listed reports present and match the data | Live, Script | ✅ |

## 8. System (automatic rules)

| ID | Requirement | How we test it | Expected result | Method | Result |
|---|---|---|---|---|---|
| FR 4.1 | Red-flag override | Answer one red flag "Yes" | Checklist stops; Urgent without the AI; service from that question | Live, Script | ✅ |
| FR 4.2 | Automatic urgency for newborns | Start a case for a baby under 8 days old | Urgent at once, no red-flag questions | Live, Script | ✅ |
| FR 4.3 | Categorise issue | Submit a normal description | AI returns one category, urgency, confidence and reason within 10 seconds | Live, Script | ✅ |
| FR 4.4 | Set triage level | Cases where the AI says urgent, says minor with high confidence, and says minor with low confidence | Urgent; Minor; Uncertain, in that order of rules | Live, Clock | ✅ |
| FR 4.5 | Escalate uncertainty | Description under 5 words; "Prefer a call"; AI error | Uncertain each time, never Minor | Live, Script, Clock | ✅ 2-word description became Uncertain |
| FR 4.6 | Protect identity | Inspect what is sent to the AI | No name, national ID or location | Script, Clock | ✅ automated test |
| FR 4.7 | AI unavailable | Make the AI fail (3 in a row, then more than 5 in 5 minutes) | "Uncertain: AI unavailable", normal message to the patient; AI skipped 1 minute after 3 failures; admin alerted after more than 5 | Clock | ✅ automated test |
| FR 4.9 | Human review of every case | Create Urgent, Uncertain and Minor cases | Every one reaches the agent queue | Live | ✅ |
| FR 5.3 | Match to capable facility | Make one facility inactive, one without the specialty on duty, one with no free bed | None of them suggested | Live, Script | ✅ |
| FR 5.4 | Rank by proximity | Case from a known location | Suggestions in straight-line distance order, nearest first | Live, Clock | ✅ |
| FR 5.7 | Reserve bed | Route with a bed needed; then let it pass 6 hours, change the routing, cancel | Bed reserved; becomes the patient's on arrival; released after 6 hours, on change or cancel | Live, Clock | ✅ 6-hour release: automated test |
| FR 5.8 | No free bed | Fill every bed at the suitable facilities | Nearest shown "No beds currently available"; agent alerted; logged | Live | ✅ fixed 13 Nov: agents now get a "No beds currently available" alert at once (live and automated test); was partial (note D) |
| FR 5.9 | No matching facility | Need a service no active facility has on duty | Case Urgent; patient sees 912 and "An agent will contact you."; logged | Live | ✅ automated test; live: no mental health clinician on duty (note E) |
| FR 5.11 | Routing expiry | Routing not marked Arrived for 24 hours | Expires, leaves the incoming list, no records unlocked, logged | Clock | ✅ automated test |
| FR 5.13 | Automatic reassignment | Attending clinician marks unavailable (or is deactivated) before arrival; once more with no one else on duty | Another same-specialty clinician assigned, notified and logged; if none, agent alerted | Live, Clock | ✅ automated test |
| FR 11.2 | Prescription code | Issue two prescriptions and open them | Each has its own unique code and QR code, the prescriber's name and licence number, and is valid for 7 days | Live, Script | ✅ unique code, licence, valid 7 days |
| FR 11.4 | Keep after expiry | Look at a prescription after 7 days, and a cancelled one | Both stay in the records for good, marked Expired or Cancelled | Live, Clock | ✅ automated test (no live prescription is 7 days old yet) |
| FR 7.1, 7.3, 10.1 | Store records, retrieve across facilities, log access | Follow one patient from case to discharge, then look at the logs and at another facility | Everything stored centrally, visible to the right people anywhere; every listed action logged with who, role and when | Live, Script | ✅ |

*(FR 7.1, 7.3 and 10.1 share one row because one end-to-end run proves all three; each is still marked on its own when run.)*

---

## Notes from this round

- **A. Wrong message when the service is down.** While the website couldn't reach the API (note B), the login screen said "Those details don't match. Something went wrong." A patient would think they typed the wrong details. It should say "Verification is temporarily unavailable" with the Emergency button, as FR 1.5 asks for when the ID service is down.
- **B. The website couldn't reach the API (found and fixed during testing).** The Vercel settings `API_URL` and `NEXT_PUBLIC_API_URL` still pointed at the old Central India app deleted on 11 November, so every login and every screen that needs data failed through the website (502, DNS_HOSTNAME_NOT_FOUND). The live check didn't catch it because it calls the API directly. Fixed by setting both to `https://api.ubuzima.wilsonn.tech` and redeploying; login through the website then worked.
- **C. 11,146 unread administrator alerts.** Most are old "delay incident" repeats. They bury new alerts.
- **D. FR 5.8 in part.** When no suitable facility has a free bed, the agent sees "No beds currently available" once they open the routing options, and the administrator gets a no-capacity alert. The SRS says the agent is alerted at once; no alert reaches the agent.
- **E. No mental health clinician on duty** (Friday day shift): routing for Mental health finds no facility, so these patients get 912 and an agent only. A schedule (data) gap, not a code fault.
- **F. Demo inbox page crashes.** `/demo/inbox` shows "This page couldn't load" (React error 441). The inbox itself works through the API. Staff use this page to read their codes in the demo.
- **G. Older history missing.** Patient records show cases and prescriptions only from 11 November on; demo activity from 25 October to 10 November isn't there. Probably from the database move; it doesn't break a requirement.

## On-screen testing (13 November, evening)

Every user type was also tested by hand in the browser on the live site. Patients at phone size, staff at desktop size; you typed each staff password and login code.

| User type | Tested on screen | Result |
|---|---|---|
| Public | First screen, Emergency (online, no GPS, offline page saved), prescription check page, protected pages send visitors to login | ✅ |
| Patient | Login (wrong details, shared device option), "Who is sick?", location list, red-flag screen, symptoms, offline sending and offline red flag, cancel, records, activity, print summary, login message when the server fails | ✅ |
| Agent | Status, queue tabs and order, offer with 30-second countdown, accept, full case and photo, triage change, live chat (patient reply shown in about 2.5 seconds), prescription, routing with held bed and clinician, close, no access after closing, my prescriptions and cancelling one, reports, my shifts | ✅ after one fix (below) |
| Clinician | Incoming summary, photo check and arrival (held bed becomes theirs), record entry and new version, hand over list, discharge (bed freed), photo mismatch recorded, mark unavailable and available, reports | ✅ |
| Facility manager | Facility profile and accepting switch, bed count, invite and turn off a clinician, schedule with gap warning, staff activity, reports, no patient records (403) | ✅ |
| Administrator | Alerts, facilities, invite a staff member (licence field for agents), change email, turn off, on-duty dashboard, agent schedule, red-flag question added, edited and removed, AI switch off and on, activity, reports, mock NIDA, no patient records (403) | ✅ after one fix (below) |

**Bugs found on screen and fixed the same evening**

1. **New cases didn't appear on agents' queues** until a reload, unless a free agent got an offer, so a Busy agent couldn't see an urgent case arrive (FR 6.2, 6.12). The API now tells every agent's queue whenever a case starts waiting. New automated test; checked on screen.
2. **Activity lists out of order:** a 26 October entry with a random id sat above today's (FR 10.2, 10.3). Lists are now ordered by time, then id. New automated test.
3. **Raw activity labels** such as "settings ai on" and "redflag removed A14": 25 actions had no plain wording; all now have one ("Turned AI suggestions on").

**Small points noticed (not requirement failures)**

- The agent's case screen and some staff pages show a blank area for several seconds while loading, with no loading sign.
- On the agent's case screen the Category and Needed service boxes are too narrow at laptop width (text cut off), and the section tabs scroll off to the side.
- The routing list heading says "nearest first" but lists suitable facilities first.
- "No agent online" alerts are emailed even when no case is waiting.
- Each live-check run leaves a turned-off "Live Test Agent" account at the top of Staff accounts.
- A new red-flag question can be saved without its Kinyarwanda text (FR 12.6 asks for both languages).
- The facility report's average stay is in days, so short stays show "0 days".
- Demo data: the night agent (Eric Habineza) is never online, so at night no agent ever answers.

## Fixed after the run (13 November)

1. **FR 5.8:** when no suitable facility has a free bed, every agent's screen now gets a "No beds currently available" alert at once (`case-flow.service.ts`). New automated test; verified live by making both emergency hospitals full for a moment.
2. **Note A:** the patient login shows "Verification is temporarily unavailable" with the Emergency button when the server or gateway fails (`login-flow.tsx`). Verified live with a simulated 502.
3. **Note F:** the demo inbox crash came from the broken `API_URL` (note B) and went away with it; the page now also says "The inbox can't be reached" instead of crashing if it happens again.
4. **Note C:** the 11,131 alerts came from one urgent test case (UC-20261026-0002) left waiting 16 days: FR 6.11 added a new "Still waiting" alert every 2 minutes. Each repeat now refreshes one alert per case, marked unread with the new waiting time (automated test). The backlog was marked read.
5. **Note E:** `scripts/demo-schedule.mjs` now has Kibagabaga's manager add a day mental health clinician (Dr. Olivier Habyarimana); mental health is covered Day and Night every day to 31 January 2027.
6. **Note G:** not a fault. The database holds every patient once (11 in all); there was simply no demo activity between 26 October and 11 November, and Jean, Eric and Ange first logged in on 11 November.
7. **Note B:** `scripts/live-check.mjs` now also checks `/api/health` and a patient login through the website (105 checks), and logs in as whichever clinician the routing picked, so it passes at night too.
