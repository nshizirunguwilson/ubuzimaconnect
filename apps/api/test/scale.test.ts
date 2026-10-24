import { currentShift } from "@ubuzima/shared";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

/**
 * NFR 4 and 5: the API at the SRS's scale (50 facilities, 100 staff, 1,000 patients a day, so about 30,000
 * requests in a month), with 20 people using it at once. Writes the measurements to docs/performance-api.json,
 * which docs/PERFORMANCE.md quotes. The AI is the stand-in (its own 10-second limit is tested in cases.test.ts).
 */
const CONCURRENCY = 20;
const REQUESTS = 200;
const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" };
const now = currentShift();
const results: { action: string; n: number; p50: number; p95: number; max: number }[] = [];
let gemini: ReturnType<typeof startFakeGemini>;
let caseId: string;

async function measure(action: string, call: (i: number) => Promise<Response | { status: number }>) {
  const times: number[] = [];
  let next = 0;
  let failures = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < REQUESTS) {
        const i = next++;
        const t = performance.now();
        const res = await call(i);
        times.push(performance.now() - t);
        if (res.status >= 400) failures++;
      }
    }),
  );
  times.sort((a, b) => a - b);
  const r = { action, n: times.length, p50: Math.round(times[Math.floor(times.length * 0.5)]), p95: Math.round(times[Math.ceil(times.length * 0.95) - 1]), max: Math.round(times[times.length - 1]) };
  results.push(r);
  expect(failures, `${action}: failed requests`).toBe(0);
  return r;
}

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  // 44 more facilities around Kigali (50 in all), each offering every service with 40 beds.
  await db.query(`
    insert into "Facility" (id, name, level, services, province, district, latitude, longitude, "totalBeds", active, "updatedAt")
    select gen_random_uuid(), 'Scale test facility ' || g, 'HEALTH_CENTRE', array['EMERGENCY_CARE','GENERAL_MEDICINE','INTERNAL_MEDICINE','PAEDIATRICS','MATERNITY','SURGERY','MENTAL_HEALTH']::"Service"[],
           'Kigali City', 'Gasabo', -1.90 - (g % 10) * 0.012, 30.02 + (g / 10) * 0.03, 40, true, now()
    from generate_series(1, 44) g`);
  // Staff up to 100: one clinician of each specialty per new facility would be 308, so 86 clinicians spread across them.
  await db.query(`
    insert into "Staff" (id, email, name, role, status, specialty, "facilityId")
    select gen_random_uuid(), 'scale' || g || '@ubuzima.test', 'Scale Clinician ' || g, 'CLINICIAN', 'ACTIVE',
           (array['EMERGENCY_CARE','GENERAL_MEDICINE','INTERNAL_MEDICINE','PAEDIATRICS','MATERNITY','SURGERY','MENTAL_HEALTH']::"Service"[])[1 + g % 7],
           (select id from "Facility" where name = 'Scale test facility ' || (1 + g % 44))
    from generate_series(1, 86) g`);
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role in ('CLINICIAN', 'AGENT') on conflict do nothing`,
    [now.date, now.shift],
  );
  // A month at 1,000 requests a day, already closed, for the reports.
  const b = browser();
  await b("/auth/patient/login", ALINE);
  const me = (await b("/auth/me")).body;
  await db.query(
    `insert into "Case" (id, code, "patientId", "openedById", status, "triageLevel", "queuedAt", "assignedAt", "closedAt", outcome, rating, "agentId", "createdAt")
     select gen_random_uuid(), 'UC-SCALE-' || g, $1, $1, 'CLOSED', (array['URGENT','UNCERTAIN','MINOR']::"TriageLevel"[])[1 + g % 3],
            t, t + interval '90 seconds', t + interval '9 minutes', (array['ADVISED_REMOTELY','ROUTED_TO_FACILITY','PRESCRIPTION_ISSUED']::"CaseOutcome"[])[1 + g % 3],
            1 + g % 5, (select id from "Staff" where email = 'agent@ubuzima.test'), t
     from generate_series(1, 30000) g, lateral (select (now() at time zone 'utc') - make_interval(secs => g * 86.4) as t) x`,
    [me.id],
  );
  caseId = (await b("/cases", { subjectId: me.id, location: KIGALI })).body.id;
  await db.query(`update "Case" set status = 'ASSIGNED', "triageLevel" = 'MINOR', "neededService" = 'GENERAL_MEDICINE', "agentId" = (select id from "Staff" where email = 'agent@ubuzima.test'), "assignedAt" = now() where id = $1`, [caseId]);
  await db.query(`update "Staff" set "agentStatus" = 'BUSY', "lastSeenAt" = (now() at time zone 'utc') + interval '1 hour' where email = 'agent@ubuzima.test'`);
}, 120_000);

afterAll(async () => {
  writeFileSync(resolve(import.meta.dirname, "../../../docs/performance-api.json"), JSON.stringify({ measuredAt: new Date().toISOString(), concurrency: CONCURRENCY, requestsPerAction: REQUESTS, results }, null, 2) + "\n");
  console.table(results);
  await gemini.close();
  await db.end();
});

describe("at the SRS's scale (NFR 4, NFR 5)", () => {
  it("answers 95% of common actions well within 3 seconds with 20 people at once", async () => {
    const agent = await staffLogin("agent@ubuzima.test");
    const admin = await staffLogin("admin@ubuzima.test");
    const er = await staffLogin("clinician@ubuzima.test");
    const patients = await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      const b = browser();
      await b("/auth/patient/login", ALINE);
      return b;
    }));
    const p = (i: number) => patients[i % CONCURRENCY];
    // A real code: 200 unknown codes from one address would rightly trip the guessing pause (FR 11.7).
    const rx = (await agent(`/agent/cases/${caseId}/prescriptions`, { items: [{ medicine: "Paracetamol 500 mg tablets", dose: "2 tablets", frequency: "3 times a day", days: 3 }] })).body.code;
    const call = (b: ReturnType<typeof browser>, path: string, body?: unknown) => b(path, body);

    const checks = [
      await measure("Patient: open a request", (i) => call(p(i), `/cases/${caseId}`)),
      await measure("Patient: home list of requests", (i) => call(p(i), "/cases/mine")),
      await measure("Patient: send a chat message", (i) => call(p(i), `/cases/${caseId}/messages`, { text: `Message ${i}` })),
      await measure("Agent: queue and status", () => call(agent, "/agent/state")),
      await measure("Agent: open the case", () => call(agent, `/agent/cases/${caseId}`)),
      await measure("Agent: facilities to route to (50 facilities)", () => call(agent, `/agent/cases/${caseId}/routing-options?service=GENERAL_MEDICINE&bedNeeded=true`)),
      await measure("Clinician: patients on the way", () => call(er, "/clinician/patients")),
      await measure("Pharmacy: check a code", () => fetch(`${API}/public/prescriptions/${rx}`)),
      await measure("Administrator: on-duty dashboard", () => call(admin, "/on-duty")),
    ];
    for (const c of checks) expect(c.p95, c.action).toBeLessThan(3000);
  }, 300_000);

  it("builds a month's report over 30,000 requests in under 3 seconds", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const date = new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
    const t = performance.now();
    const rep = (await admin(`/reports?period=month&date=${date}`)).body;
    const ms = Math.round(performance.now() - t);
    results.push({ action: "Administrator: month report (30,000 requests)", n: 1, p50: ms, p95: ms, max: ms });
    expect(rep.tiles.find((x: { label: string }) => x.label === "Requests").value).toBeGreaterThan(10_000);
    expect(ms).toBeLessThan(3000);
  }, 60_000);
});
