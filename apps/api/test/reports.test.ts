import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

/** FR 12.8: cases with known times are written straight into the test database, so every number can be checked. */
const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" };
const now = currentShift();
const today = new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);

type B = ReturnType<typeof browser>;
let gemini: ReturnType<typeof startFakeGemini>;
let admin: B;
let agent: B;
let manager: B;
let er: B;
let ids: Record<string, string>;
type Tile = { label: string; value: number | null };
type Table = { title: string; rows: (string | number | null)[][] };
const tile = (rep: { tiles: Tile[] }, label: string) => rep.tiles.find((t) => t.label === label)?.value;
const table = (rep: { tables: Table[] }, title: string) => rep.tables.find((t) => t.title === title)!.rows;

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role in ('CLINICIAN', 'AGENT') on conflict do nothing`,
    [now.date, now.shift],
  );
  ids = Object.fromEntries((await db.query(`select id, email from "Staff"`)).rows.map((r) => [r.email.split("@")[0], r.id]));
  [admin, agent, manager, er] = await Promise.all(["admin", "agent", "manager", "clinician"].map((n) => staffLogin(`${n}@ubuzima.test`)));

  const b = browser();
  await b("/auth/patient/login", ALINE);
  const me = (await b("/auth/me")).body;
  // queued, accepted and closed this many minutes ago; then outcome, rating and agent
  const cases: [string, number, number, number, string, number | null, string][] = [
    ["MINOR", 10, 8, 2, "ADVISED_REMOTELY", 5, ids.agent],
    ["MINOR", 20, 16, 6, "ROUTED_TO_FACILITY", 3, ids.agent],
    ["UNCERTAIN", 30, 24, 20, "PRESCRIPTION_ISSUED", null, ids.agent2],
  ];
  let n = 0;
  for (const [level, q, a, c, outcome, rating, agentId] of cases) {
    await db.query(
      `insert into "Case" (id, code, "patientId", "openedById", status, "triageLevel", "queuedAt", "assignedAt", "closedAt", outcome, rating, "agentId", "createdAt")
       values (gen_random_uuid(), $1, $2, $2, 'CLOSED', $3::"TriageLevel", (now() at time zone 'utc') - make_interval(mins => $4), (now() at time zone 'utc') - make_interval(mins => $5),
               (now() at time zone 'utc') - make_interval(mins => $6), $7::"CaseOutcome", $8, $9, (now() at time zone 'utc') - make_interval(mins => $4))`,
      [`UC-TEST-${++n}`, me.id, level, q, a, c, outcome, rating, agentId],
    );
  }
  await db.query(`insert into "AuditEvent" (id, "actorType", action, "createdAt") values (gen_random_uuid(), 'system', 'case.delay_incident', now() at time zone 'utc')`);
});
afterAll(async () => {
  await gemini.close();
  await db.end();
});

describe("reports (FR 12.8)", () => {
  it("gives the administrator the service numbers for the period", async () => {
    const rep = (await admin(`/reports?period=month&date=${today}`)).body;
    expect(rep.title).toBe("Service report");
    expect(tile(rep, "Requests")).toBe(3);
    expect(tile(rep, "Median wait for an agent")).toBe(4); // waits of 2, 4 and 6 minutes
    expect(tile(rep, "Delay incidents")).toBe(1);
    expect(tile(rep, "Minor cases closed without travel")).toBe(50); // 1 of the 2 minor cases
    expect(tile(rep, "Average rating")).toBe(4);
    expect(table(rep, "Requests by triage level")).toContainEqual(["Minor", 2]);
    expect(table(rep, "Closed requests by outcome")).toContainEqual(["Prescription issued", 1]);
    // Diane: 2 cases, handling of 6 and 10 minutes, ratings 5 and 3.
    expect(table(rep, "Agent performance")).toContainEqual(["Diane Umutoni", 2, 6, 4]);
    expect(table(rep, "Scheduled and online agents").length).toBeGreaterThanOrEqual(28);
  });

  it("shows a day with nothing in it as empty, not as zero", async () => {
    const rep = (await admin("/reports?period=day&date=2026-01-01")).body;
    expect(tile(rep, "Requests")).toBe(0);
    expect(tile(rep, "Median wait for an agent")).toBeNull();
    expect(tile(rep, "Average rating")).toBeNull();
  });

  it("gives agents their own work, and clinicians their own patients", async () => {
    const mine = (await agent(`/reports?period=week&date=${today}`)).body;
    expect(mine.title).toBe("My work");
    expect(tile(mine, "Cases closed")).toBe(2);
    expect(tile(mine, "Average rating")).toBe(4);

    // A patient arrives, gets a prescription and is discharged by the emergency clinician.
    const b = browser();
    await b("/auth/patient/login", ALINE);
    const me = (await b("/auth/me")).body;
    const id = (await b("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    let v = (await b(`/cases/${id}`)).body;
    if (v.stage === "PREGNANCY") v = (await b(`/cases/${id}/pregnancy`, { pregnant: false })).body;
    v = (await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: false })).body;
    await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: true });
    const routingId = (await db.query(`select id from "Routing" where "caseId" = $1`, [id])).rows[0].id;
    await er(`/clinician/incoming/${routingId}/arrive`, {});
    await er(`/clinician/visits/${routingId}/prescriptions`, { items: [{ medicine: "Salbutamol inhaler 100 mcg", dose: "2 puffs", frequency: "When short of breath", days: 7 }] });
    await er(`/clinician/visits/${routingId}/finish`, {});

    const clin = (await er(`/reports?period=day&date=${today}`)).body;
    expect(clin).toMatchObject({ title: "My patients" });
    expect(tile(clin, "Patients seen")).toBe(1);
    expect(tile(clin, "Prescriptions issued")).toBe(1);
    expect(table(clin, "How visits ended")).toContainEqual(["Discharged", 1]);

    // The same visit, seen by the manager of that facility.
    const fac = (await manager(`/reports?period=day&date=${today}`)).body;
    expect(fac.title).toBe("Kacyiru District Hospital: facility report");
    expect(tile(fac, "Arrived")).toBe(1);
    expect(table(fac, "Movements")).toContainEqual(["Discharged", 1]);
  });

  it("downloads the report as a spreadsheet file, and logs the download", async () => {
    const res = await fetch(`${API}/reports/csv?period=month&date=${today}`, { headers: { cookie: await adminCookie() } });
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="ubuzimaconnect-report-month-\d{4}-\d{2}-01\.csv"/);
    const text = await res.text();
    expect(text).toContain('"Median wait for an agent","4","min"');
    expect(text).toContain('"Diane Umutoni","2","6","4"');
    expect((await db.query(`select count(*)::int as n from "AuditEvent" where action = 'report.downloaded'`)).rows[0].n).toBe(1);
  });

  it("refuses a period it doesn't know, and patients", async () => {
    expect((await admin("/reports?period=year")).status).toBe(400);
    expect((await admin("/reports?period=day&date=yesterday")).status).toBe(400);
    const b = browser();
    await b("/auth/patient/login", ALINE);
    expect((await b("/reports")).status).toBe(403);
  });
});

/** The test client keeps its cookie inside; a file download needs one on a plain fetch, so this logs in again. */
async function adminCookie() {
  const res = await fetch(`${API}/auth/staff/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@ubuzima.test", password: "Ubuzima-demo-2026" }) });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const code = (await db.query(`select subject from "EmailMessage" where "to" = 'admin@ubuzima.test' order by "createdAt" desc limit 1`)).rows[0].subject.match(/(\d{3}) (\d{3})/).slice(1).join("");
  await fetch(`${API}/auth/staff/code`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ code }) });
  return cookie;
}
