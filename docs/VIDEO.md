# Demo video plan

**Target:** about 8 minutes. Check the length limit on Canvas before recording, and cut scenes 7 and 8 first if it's shorter.

**What the rubric looks for, and where the video shows it:**

| Rubric line | Points | Shown in |
|---|---:|---|
| Reflections of system requirements: every user's functions from the SRS visible | 10 | Scenes 2 to 8: patient, agent, clinician, pharmacy, facility manager, administrator |
| Presentation video | 5 | The whole video: a clear story, one patient from start to finish |
| Code availability: public GitHub, clear setup | 5 | Scene 9: the repo and the README |
| Solution deployment: public URL | 5 | Every scene runs on https://ubuzima.wilsonn.tech, shown in the address bar |
| Operation: login, sign-up, buttons, redirects | 5 | Scenes 2, 3 and 8: patient login, staff login with the code, invitation (staff sign-up), logout redirects |

## Before recording

- **Two browsers side by side**, both on the live site:
  - the **patient** in Chrome's phone view (375 px, Pixel or iPhone);
  - the **agent**, later the **clinician**, in a normal window (1280 px).
- **A third tab** on https://ubuzima.wilsonn.tech/demo/inbox for staff login codes.
- **Accounts** (README "Try it"):
  - patient Aline Uwase, ID `1 1992 7 0045823 1 16`, born 14 Mar 1992;
  - `agent@ubuzima.test`, `clinician@ubuzima.test`, `manager@ubuzima.test` and `admin@ubuzima.test`, with the demo password in `apps/api/src/seed.ts`.
- **Clean start:** the agent is Available, and no open requests are left over from rehearsals.
- **Prepare the danger signs:** on the Red-flag list, check which question numbers you will answer Yes to (A2: breathing).

## Scenes

### 1. The problem (0:00–0:30)
- **On screen:** the welcome page.
- **Say:** "In Rwanda, patients often travel to the wrong facility, or wait too long for urgent care. UbuzimaConnect lets a patient describe the problem on a phone. A health agent, helped by an AI suggestion, sends them to the right facility, where a bed and a clinician are waiting."

### 2. Patient: log in and ask for help (0:30–1:45)
- Switch to **Kinyarwanda** and back, to show both languages.
- **Log in:**
  - the national ID, typed in its six parts;
  - date of birth and name, checked against the mock national ID service;
  - optionally show "This is not my device".
- **Home:** her children Kevin and Grace (the family model).
- **Get help → Kevin → Use my location.**
  - Answer the danger signs: say No to the first, **Yes** to A2 (breathing).
  - It's Urgent at once: "Go for care now", the nearest facility with a bed held, Call 912.

### 3. Agent: queue, chat, triage, routing (1:45–3:30)
- **Agent login:** password, then the 6-digit code from the demo inbox, entered in the code boxes.
- **Status Available**, then the offer arrives, with a 30-second countdown: **Accept**.
- **The case:**
  - the photo from the ID record;
  - the danger sign;
  - the AI's suggestion, labelled as one.
- **Chat:** the agent writes, the patient answers with a quick reply. Show it arriving live on the phone.
- **Review the triage**, confirm the routing (facility, clinician, bed), and **Close as Routed to facility**.
- **The patient sees** "Your health agent confirmed where to go" and can rate the help.

### 4. Clinician: arrival, record, prescription, discharge (3:30–5:00)
- **Clinician login:** the patient appears under **On the way**: a summary only, no name.
- **Open it:** compare the photo, then **Mark arrived**. The visit opens, with the bed now in use.
- **Write a record entry**, then edit it to show that the earlier version is kept.
- **Issue a prescription:** "Salbutamol inhaler, 2 puffs when short of breath, 7 days".
- **Discharge:** the bed is freed.

### 5. Pharmacy and the patient's records (5:00–5:45)
- **Patient:** **Records** shows the prescription with its **QR code**, the visit and the clinician's notes. Show **Print summary**, then **Activity**: everyone who opened her record.
- **Pharmacy:** `/check` with the code shows **Valid**, the medicines and the prescriber's licence.

### 6. When things go wrong (5:45–6:30)
- **No connection:** a request answered offline shows "Not sent yet" and the saved facilities; it sends itself when the connection is back. (Use Chrome's Network → Offline.)
- **Emergency page:** works without logging in.
- **No agent online:** the patient is told what to do, and the administrator gets an alert. Show the Alerts page.

### 7. Facility manager (6:30–7:00)
- **Facility profile and beds**, the clinicians, and the weekly schedule with its gaps.
- **Reports:** arrivals, beds in use, shift gaps; then **Download CSV**.

### 8. Administrator (7:00–7:40)
- **Staff accounts → Invite.** Open the invitation from the demo inbox, set a password: that's staff sign-up.
- **On duty:** who is scheduled and who is online.
- **Red-flag list** (with Kinyarwanda), and **Settings** (the AI switch).
- **Activity log**, and the **Reports** for the month.
- **Log out:** the confirmation, then the redirect to the login page.

### 9. Code and close (7:40–8:00)
- **GitHub:** the README (setup, deployment, known limitations), and `docs/TRACEABILITY.md`, which tracks every requirement to its test.
- **Say:** "Everything in the SRS is built and tested, with 170 automated tests. The Kinyarwanda texts are waiting for a native speaker's review."

## Recording tips

- Record at 1920×1080, with the browser zoomed to 110% so the text reads on a small screen.
- Rehearse once on the live site, then reset: close the open requests, and set the agent Available.
- Keep each click slow enough to see. Pause on the screen that proves a requirement before moving on.
