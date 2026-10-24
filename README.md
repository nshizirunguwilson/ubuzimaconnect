# UbuzimaConnect

A telehealth triage platform for Rwanda. A patient logs in with their national ID and describes what is wrong. A health agent reviews the case, with an AI suggestion, and sends the patient to the right facility.

| App | What it is | Local URL |
|---|---|---|
| `apps/web` | Next.js 16: the patient app (phone first) and the staff app | http://localhost:3000 |
| `apps/api` | NestJS 12 API (runs on Express) with Prisma 7 and PostgreSQL | http://localhost:4000 |
| `apps/nida-mock` | A mock of the national ID service (NIDA), with fictional people | http://localhost:4100 |
| `packages/db` | Prisma schema, migrations and client | |
| `packages/shared` | Validation rules, limits and types used by both web and API | |

What the SRS asks for, and what is built so far: [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md).

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

Create the tables and the demo data:

```bash
pnpm --filter @ubuzima/db migrate && pnpm --filter @ubuzima/api seed
```

Start all three apps:

```bash
pnpm dev
```

## Try it

**Patient** (http://localhost:3000): log in with a fictional person from the mock NIDA ([`apps/nida-mock/src/citizens.ts`](apps/nida-mock/src/citizens.ts)):

| National ID | Date of birth | A name | Notes |
|---|---|---|---|
| 1 1992 7 0045823 1 16 | 14 Mar 1992 | Uwase | Has two children, aged 7 and 3 |
| 1 1985 8 0067412 1 63 | 1 Jul 1985 | Habimana | Has two children, one aged 17 |
| 1 2009 7 0031504 1 28 | 21 May 2009 | Ange | The 17-year-old: sees only her own record (FR 1.3) |
| 1 2001 8 0054377 1 09 | 30 Sep 2001 | Eric | Has a 3-day-old baby: Urgent with no questions (FR 4.2) |
| 1 1996 7 0078215 1 35 | 18 Apr 1996 | Claudine | Has a 5-week-old baby: gets the newborn question N1 |
| 1 1960 7 0012689 2 41 | 25 Dec 1960 | Mukamana | Aged 65, no children in the record |

**Agent workflow:** log in as `agent@ubuzima.test`, choose **Available**, and accept the case offered. In another browser (or a private window), log in as a patient and start a request to see it arrive.

**Clinician workflow:** log in as `clinician@ubuzima.test` (Kacyiru, emergency care). When a patient answers Yes to a red flag near Kigali, they appear under **Patients → On the way**. Open them, compare the photo, and mark them arrived to open the visit.

**Staff** (http://localhost:3000/staff/login): seeded accounts in [`apps/api/src/seed.ts`](apps/api/src/seed.ts), all with the demo password set there: `admin@`, `agent@`, `manager@` (Kacyiru District Hospital), `clinician@` (emergency care) and more, all `@ubuzima.test`. The seed also creates six Kigali facilities (real names; services, beds and coordinates are approximate demo values), this week's shifts and the red-flag list from SRS Appendix C. After the password, the login code is "emailed": open **http://localhost:3000/demo/inbox** to read it.

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
- **Web:** checks the contrast of every colour pair.
- **Shared and mock NIDA:** check the validation and identity rules.

## Troubleshooting

- **A style change doesn't show up in the browser:** stop the web dev server, delete `apps/web/.next`, and start it again. Turbopack sometimes keeps old Tailwind CSS.

## Status

Phases 0, 1 and 2 are built, and one test (`apps/api/test/flow.test.ts`) follows a patient through the whole flow:
- **Phase 1, batch 1:** facilities, beds, clinicians, schedules, the red-flag list and the AI switch.
- **Batch 2:** the patient's request: who is sick, location, red flags, symptoms, AI triage, urgent guidance, prefer a call, cancel.
- **Batch 3:** the agent queue and offers, live chat, calls, triage review, routing with beds and clinicians, closing and rating.
- **Batch 4:** clinicians: patients on the way, arrival with a photo check, visits with versioned records, beds, transfer, discharge and handover.
- **Batch 5:** prescriptions with a code, a QR code and a public check page at `/check`; patient records, a printable summary and activity; staff activity; the on-duty dashboard.

One phase 1 item is still open: the Kinyarwanda text of the 23 red-flag questions needs a Kinyarwanda speaker. Phase 3 brings the timers, escalations, push notifications, offline use, Kinyarwanda screens, alerts and reports. See [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) for every requirement's status.
