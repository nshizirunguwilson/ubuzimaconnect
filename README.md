# UbuzimaConnect

A telehealth triage platform for Rwanda. A patient logs in with their national ID and describes what is wrong. A health agent reviews the case, with an AI suggestion, and sends the patient to the right facility.

| App | What it is | Local URL |
|---|---|---|
| `apps/web` | Next.js 16: the patient app (phone first) and the staff app | http://localhost:3000 |
| `apps/api` | NestJS 12 API (runs on Express) with Prisma 7 and PostgreSQL | http://localhost:4000 |
| `apps/nida-mock` | A mock of the national ID service (NIDA), with fictional people | http://localhost:4100 |
| `packages/db` | Prisma schema, migrations and client | |
| `packages/shared` | Validation rules, limits and types used by both web and API | |

## Links

- **Live site:** https://ubuzima.wilsonn.tech (patients) and https://ubuzima.wilsonn.tech/staff/login (staff). Being deployed now, following [`docs/DEPLOY.md`](docs/DEPLOY.md).
- **Code:** https://github.com/nshizirunguwilson/ubuzimaconnect
- **Demo video:** link added once recorded. The plan is in [`docs/VIDEO.md`](docs/VIDEO.md).

What the SRS asks for, and the status of every requirement: [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md).

Design rules and the reasons behind them: [`docs/design/DESIGN.md`](docs/design/DESIGN.md), [`RESEARCH.md`](docs/design/RESEARCH.md), [`DECISIONS.md`](docs/design/DECISIONS.md).

## Run it locally

You need **Node 22**, **pnpm 12** (`corepack enable pnpm`) and **PostgreSQL 16**.

```bash
pnpm install
```

```bash
createdb ubuzima && createdb ubuzima_test
```

Copy the example settings. The defaults work on one computer:

```bash
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local && cp packages/db/.env.example packages/db/.env
```

In `packages/db/.env` and `apps/api/.env`, set `DATABASE_URL=postgresql://<your-user>@localhost:5432/ubuzima`. In `apps/api/.env`, set `APP_SECRET` to any long random string.

Create the database client, the tables and the demo data:

```bash
pnpm --filter @ubuzima/db generate && pnpm --filter @ubuzima/db migrate && pnpm --filter @ubuzima/api seed
```

Start all three apps:

```bash
pnpm dev
```

## Try it

**Live demo: https://ubuzima.wilsonn.tech** (locally: http://localhost:3000). Everyone below is made up: the patients exist only in the mock NIDA, and the staff accounts only in the demo database.

### Staff: email + password, then a 6-digit code

All staff accounts use the password **`Ubuzima-demo-2026`** (set in [`apps/api/src/seed.ts`](apps/api/src/seed.ts)). After the password, the login code is "emailed" to the made-up address: open **https://ubuzima.wilsonn.tech/demo/inbox** (locally `/demo/inbox`) and copy the newest code for that email. Staff log in at **/staff/login**.

| Role | Email | Name | What to try |
|---|---|---|---|
| Administrator | `admin@ubuzima.test` | Patrick Nkurunziza | Staff accounts and invitations, facilities, agent schedule, on duty, red-flag list, AI switch, alerts, activity log, reports, and **Mock NIDA**: add your own made-up person, then log in as them |
| Health agent | `agent@ubuzima.test` | Diane Umutoni | Set **Available**, accept the offer, chat, call note, triage, routing, prescription, close |
| Health agent | `agent2@ubuzima.test` | Eric Habineza | A second agent, for offers passing between agents |
| Facility manager | `manager@ubuzima.test` | Olivier Rukundo | Kacyiru District Hospital: profile, beds, clinicians, weekly schedule, reports |
| Facility manager | `manager2@ubuzima.test` | Grace Mukandori | Kibagabaga Hospital |
| Facility manager | `manager3@ubuzima.test` | Jeanne Uwamariya | Remera Health Centre (live demo only, D69) |
| Clinician, emergency care | `clinician@ubuzima.test` | Dr. Samuel Mugisha | Kacyiru, day shift: **Patients → On the way**, mark arrived, record entries, bed, prescription, discharge |
| Clinician, emergency care | `er.night@ubuzima.test` | Dr. Alice Mukarwego | Kacyiru, night shift (live demo only) |
| Clinician, paediatrics | `paeds.day@ubuzima.test` | Dr. Fabrice Nshimiyimana | Kacyiru, day shift (live demo only) |
| Clinician, paediatrics | `paeds@ubuzima.test` | Dr. Claudine Ingabire | Kacyiru, night shift |
| Clinician, maternity | `maternity@ubuzima.test` | Marie Uwera | Kacyiru, day shift |
| Clinician, maternity | `maternity.night@ubuzima.test` | Agnes Nyirahabimana | Kacyiru, night shift (live demo only) |
| Clinician, surgery | `surgery.day@ubuzima.test` | Dr. Thierry Bizimana | Kacyiru, day shift (live demo only) |
| Clinician, surgery | `surgery@ubuzima.test` | Dr. Jean Bosco Nsengimana | Kacyiru, night shift |
| Clinician, general medicine | `gp@ubuzima.test` | Dr. Yvette Uwamahoro | Kacyiru, day shift |
| Clinician, general medicine | `gp.night@ubuzima.test` | Dr. Chantal Uwineza | Kacyiru, night shift (live demo only) |
| Clinician, internal medicine | `internal.day@ubuzima.test` | Dr. Didier Hakizimana | Kacyiru, day shift (live demo only) |
| Clinician, internal medicine | `internal@ubuzima.test` | Dr. Emmanuel Kayitare | Kacyiru, night shift |
| Clinician, emergency care | `kib.er@ubuzima.test` | Dr. Aimable Ndayisaba | Kibagabaga, day shift |
| Clinician, mental health | `kib.mh@ubuzima.test` | Dr. Solange Uwase | Kibagabaga, night shift |
| Clinician, general medicine | `remera@ubuzima.test` | Josiane Mukeshimana | Remera Health Centre, day shift |

Day shifts run 07:00 to 19:00 and night shifts 19:00 to 07:00, Kigali time. A clinician only sees patients routed to them while they are on duty.

### Patients: national ID, date of birth and one name (no password)

Log in at **/login** with one of these fictional people from the mock NIDA ([`apps/nida-mock/src/citizens.ts`](apps/nida-mock/src/citizens.ts)). Type the 16 digits; the form groups them as on the card.

| National ID | Date of birth | A name | What it shows |
|---|---|---|---|
| 1 1992 7 0045823 1 16 | 14 Mar 1992 | Uwase | A parent with Kevin (7) and Grace (3): the family model, child signs |
| 1 1985 8 0067412 1 63 | 1 Jul 1985 | Habimana | A parent with Divine (11) and Ange (17): parents see children at any age |
| 1 2009 7 0031504 1 28 | 21 May 2009 | Ange | The 17-year-old: logs in herself and sees only her own record (FR 1.3) |
| 1 2001 8 0054377 1 09 | 30 Sep 2001 | Eric | A parent of a 3-day-old baby: Urgent with no questions (FR 4.2) |
| 1 1996 7 0078215 1 35 | 18 Apr 1996 | Claudine | A woman of 30 ("Are you pregnant?"), and a 5-week-old baby who gets the young-baby sign N1 |
| 1 1960 7 0012689 2 41 | 25 Dec 1960 | Mukamana | Aged 65, no children in the record |

To make your own patient, log in as the administrator and open **Mock NIDA**: add a person (with a photo if you like), and the page shows the new ID to log in with.

Children have no ID of their own: a parent chooses them under "Who is sick?". The example ID in the login hint is made up and is not in the mock NIDA. Five wrong tries lock an ID for 15 minutes (FR 1.6).

### No account needed

- **Emergency:** the Emergency button on the first screen (`/emergency`): 912 and the nearest emergency facility.
- **Pharmacist:** `/check`, then the code of a prescription issued in the demo (an agent or clinician issues one in a minute), or scan its QR code with a phone camera. An unknown code shows "Prescription not found".

### Try a whole case

Use two browsers (or one normal and one private window). In one, log in as `agent@ubuzima.test` and choose **Available**. In the other, log in as a patient, tap **Get help**, and tap a danger sign or describe a problem. The offer reaches the agent within seconds; chat from both sides, then route the patient (Kacyiru, emergency care) and log in as `clinician@ubuzima.test` to mark them arrived.

To see "verification unavailable" (FR 1.5), switch the mock NIDA off and on:

```bash
curl -X POST localhost:4100/v1/outage -H 'x-api-key: dev-nida-key' -H 'content-type: application/json' -d '{"on":true}'
```

## AI triage

Add your key to `apps/api/.env` as `GEMINI_API_KEY=...`. Without it the app still works: every case takes the "AI unavailable" path and goes to an agent as Uncertain (FR 4.7).

## Performance

How fast the app is at the SRS's scale, and on a 3G phone, is in [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

## Kinyarwanda

Every patient and pharmacy screen has a **Kinyarwanda · English** switch. The Kinyarwanda is a draft waiting for review by a native speaker: see [`docs/translations`](docs/translations/README.md). After correcting the texts, make the review sheet again with:

```bash
pnpm translations
```

## Push notifications

Generate a key pair once and put it in `apps/api/.env` (as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`):

```bash
npx web-push generate-vapid-keys
```

Without the keys everything works except notifications. Try it in Chrome: open a request as a patient, tap **Turn on notifications**, close the tab, and send a message as the agent.

## Tests

```bash
pnpm test
```

- **API:** starts the built API and mock NIDA against `ubuzima_test`: logins (FR 1, 2), cases and AI triage, the agent's work, routing and beds, clinicians, prescriptions, records and activity, role access, and the whole flow end to end.
- **Web:** checks the contrast of every colour pair, the offline queue, and that every Kinyarwanda text exists.
- **Shared and mock NIDA:** check the validation and identity rules.

## Troubleshooting

- **A style change doesn't show up in the browser:** stop the web dev server, delete `apps/web/.next`, and start it again. Turbopack sometimes keeps old Tailwind CSS.

## Deployment

Vercel (web), Azure App Service in Central India (API and mock NIDA), Supabase in Mumbai (database), Resend (email), and the domain `wilsonn.tech`. Step by step, with every setting: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Known limitations

- **Kinyarwanda is a draft.** Every text was written by the developer, who isn't a native speaker, and needs checking by a Kinyarwanda speaker. The 23 danger-sign questions also need a clinician's check ([`docs/translations`](docs/translations/README.md)).
- **The national ID service is a mock.** It holds fictional people. Connecting to the real NIDA needs an agreement with NIDA and changes only `apps/api/src/auth/nida.client.ts`.
- **The live site is a public demo.** The demo staff passwords are in this README, and their login codes appear at `/demo/inbox`, so anyone can log in as a demo agent, clinician or administrator. All data is fictional. For real use: set `DEMO_INBOX` off and give staff real accounts.
- **One API instance.** Live updates (chat, offers, alerts) travel through memory. A second instance first needs them moved to Postgres LISTEN/NOTIFY (D34, [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)).
- **Measured on one computer.** Page loads on 3G are calculated, not measured on a phone. A first visit is about 3 seconds on 3G, at the limit. Installing on a real iPhone and Android phone hasn't been tried yet.
- **iPhone notifications** need the app added to the Home Screen first (an Apple rule).
- **Data protection.** The database and API are in India, and the AI is Google's Gemini (it receives no name, ID or location). Rwanda's Law No. 058/2021 asks for authorisation to store personal data outside Rwanda, so real patient data needs that authorisation, or hosting in Rwanda.
- **The code-guessing pause works per address.** Someone calling the API directly can hide their address. The codes are 40 random bits, so guessing stays impractical anyway.

## Status

Everything in the SRS is built, phase by phase, and each phase was reviewed in the browser at 375 and 1280 px:
- **Phase 0:** both logins and the roles.
- **Phase 1:** every screen, in five batches: setup data; the patient's request; the agent's queue, chat and routing; clinicians and visits; prescriptions, records and activity.
- **Phase 2:** the whole flow, end to end (`apps/api/test/flow.test.ts`).
- **Phase 3:** timers and escalations, alerts, push notifications, offline use, Kinyarwanda, reports, and the performance checks.
- **Phase 4:** the public repository, the demo inbox, deployment packaging and docs. Going live is in progress.

What's still open is listed under Known limitations above, and requirement by requirement in [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md).
