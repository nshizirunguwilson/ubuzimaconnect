# Presentation video plan

The presentation video is you presenting the slide deck, "UbuzimaConnect | Your Health on Time" (Google Slides), with your face in a corner and a short live demo in the middle. It is separate from the full demo video ([`VIDEO.md`](VIDEO.md)), which shows every requirement one by one. Here the job is the story: the problem, why it matters, what you built, how you know it works, and what is left.

**Length:** about 10 to 12 minutes. Check the limit on Canvas first; if it is shorter, cut the literature slide to 30 seconds and the demo to 2 minutes.

## Fix the deck first

The deck was made on 2 November and some facts have changed since:

| Slide | Now says | Should say |
|---|---|---|
| 1. Title | `[Supervisor's name]`, `[Presentation date]`, empty department | Fill in all three |
| 7. System Design | PostgreSQL: Supabase | Azure Database for PostgreSQL (UAE North) |
| 8. Implementation | Database: PostgreSQL (Supabase); Infrastructure: Vercel, Azure | Database: PostgreSQL on Azure; the API and database in one Azure region |
| 9. Testing | 199 passing | **202 passing** |
| 9. Testing | Requirements: 105 of 106 done; the last: the Kinyarwanda review | **All 106 functional requirements work**, tested by script and by hand on the live site for every user type. The Kinyarwanda review by a native speaker is still open (a quality requirement, NFR 7, not a functional one) |
| 9. Testing | Installs as an app: iPhone (simulator) | iPhone and Android (simulator and emulator) |
| 10. Conclusion | 105 of 106 requirements met | All 106 functional requirements met |
| 10. Limitations | Data is hosted outside Rwanda | Keep, and say where: UAE North (Azure) |

Worth adding to slide 9 if there is room: "105 live checks run against the deployed site after every change".

## Before recording

- Deck in **Present** mode on one screen; the live site logged in and ready on the other (see the demo below).
- Camera on, face in a small corner; a quiet room; a headset or external microphone.
- Record at 1920×1080 or higher (OBS, Loom or QuickTime with screen and camera).
- Rehearse once with a timer. Say the numbers on the slides, don't read every bullet.

## Slide by slide

### 1. Title (0:00 to 0:20)
"Hello, I'm Wilson Nshizirungu, BSc in Software Engineering, full-stack track. My project is UbuzimaConnect: a connected patient record and intelligent triage system for Rwandan healthcare."

### 2. Problem context (0:20 to 1:20)
- Patients travel to the wrong facility, or arrive too late, and pay for each trip.
- Babyl showed that remote care works in Rwanda, then closed overnight in 2023 when its UK parent failed.
- e-Ubuzima keeps records, but nothing triages patients or sends them to a facility that can receive them.
- **One sentence to land:** "The gap isn't records, it's getting the right patient to the right place in time."

### 3. Evidence (1:20 to 2:00)
Point at the four numbers: 2.8 million Babyl users (about 20% of Rwanda), closed overnight, 1,055 respiratory and 246 malaria cases back on facilities, e-Ubuzima in 15 of 30 districts.

### 4. Objectives and scope (2:00 to 2:45)
- Three objectives: national ID login in Kinyarwanda or English; safe triage (danger signs first, then an AI suggestion a person reviews); routing to the nearest facility with the service, a free bed and a clinician on duty.
- In scope: the six roles. Out of scope, said honestly: the real national ID service (a mock stands in), road distance, payments and ambulances.

### 5. Literature review (2:45 to 3:30)
Three themes in one breath each: what works (telemedicine cut facility visits), what failed (foreign ownership), the gap (no local service triages and routes to a free bed). End on the last line of the slide.

### 6. Existing systems (3:30 to 4:00)
"Babyl, e-Ubuzima, SAMU 912 and Ada each do part of it. UbuzimaConnect is the only one with all six: locally owned, national ID login, triage checked by a person, routing to a free bed, a record that follows the patient, and Kinyarwanda."

### 7. System design (4:00 to 5:00)
Walk the diagram top to bottom:
- three front ends in one Next.js site on Vercel: patient app (phone first, works offline), staff app, pharmacy check;
- one NestJS API on Azure App Service, next to the PostgreSQL database in the same Azure region;
- outside services: the mock national ID service, Gemini for the AI suggestion, Resend for email, web push;
- "Every open screen updates live: the API sends events through PostgreSQL, so it can run as several copies."

### 8. Implementation and live demo (5:00 to 8:30)
Say the stack in one line, then switch to the browser. A **3-minute** demo that follows one patient, with two windows side by side (patient in phone view on the left, staff on the right). Everything is logged in before recording.

1. **Patient** (Aline) logs in with the national ID, date of birth and a name. Get help → Kevin → one danger sign **Yes** (breathing): Urgent at once, the nearest facility, 912. *(40 s)*
2. **Agent** (Diane, already logged in and Available): the offer arrives, Accept. The case with the photo, the danger sign and the AI suggestion. One chat message both ways. Confirm the routing: facility, bed held, clinician assigned. Close as routed. *(70 s)*
3. **Clinician** (Dr. Samuel): Patients on the way, compare the photo, Mark arrived, write a prescription. *(40 s)*
4. **Pharmacy:** `/check` with the code: Valid, prescriber and licence. *(20 s)*
5. Back to the slides: "The full demo video shows all 106 requirements, every user type, including the night shift."

If something fails live, keep going and say what should have happened; don't restart.

### 9. Testing and evaluation (8:30 to 9:45)
- **202 automated tests**, and **105 live checks** run against the deployed site after every change.
- Every one of the 106 functional requirements was tested by script and by hand on screen for each user type; the problems found were fixed the same day (for example, a queue that needed a reload and a missing "no free bed" alert).
- Speed: 95% of answers within 77 ms at the SRS scale (50 facilities, 30,000 requests a month); 0.6 to 0.7 s per action on a 3G phone.
- Installs as an app on iPhone and Android.

### 10. Conclusion and future work (9:45 to 11:00)
- **Outcome:** a deployed system all six user types can use today, at ubuzima.wilsonn.tech.
- **Strengths:** danger signs before the AI; a trained person always decides; patients sent only where they can be received; two languages; works offline.
- **Limitations, said plainly:** the Kinyarwanda needs a native speaker's review; data hosted outside Rwanda (needs authorisation); a mock national ID service; straight-line distance; not yet tried with real patients; the AI depends on Gemini.
- **Next:** a Kinyarwanda review, a pilot with one district hospital, road distance, and hosting in Rwanda.

### 11. Thank you (11:00 to 11:15)
"Thank you. The code is public on GitHub and the app is live at ubuzima.wilsonn.tech."

## After recording

- Watch it once at normal speed: is every number readable, is the voice clear over the demo?
- Upload, then put the deck link, the live URL, the GitHub link and the demo video link in the description.
- Close the demo cases and set the agent Offline.
