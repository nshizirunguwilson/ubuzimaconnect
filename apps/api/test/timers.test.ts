import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

/** The timers run every 300 ms in tests (TIMER_MS); production uses 15 s. Times are moved into the past in the database. */
const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const PEOPLE = {
  aline: { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" },
  claudine: { nationalId: "1199670078215135", dateOfBirth: "1996-04-18", name: "Claudine" },
};
type B = ReturnType<typeof browser>;

let gemini: ReturnType<typeof startFakeGemini>;
let admin: B;
let agent: B;
let er: B;
const now = currentShift();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await wait(150);
  }
}
/** Timestamps are stored as UTC without a zone, so SQL compares against UTC "now". */
const one = async (sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0];

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role in ('CLINICIAN', 'AGENT') on conflict do nothing`,
    [now.date, now.shift],
  );
  [admin, agent, er] = await Promise.all(["admin", "agent", "clinician"].map((n) => staffLogin(`${n}@ubuzima.test`)));
});
afterAll(async () => {
  await gemini.close();
  await db.end();
});
beforeEach(async () => {
  await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
  await db.query(`update "Routing" set status = 'CANCELLED' where status in ('SUGGESTED', 'CONFIRMED', 'ARRIVED')`);
  await db.query(`update "BedReservation" set status = 'RELEASED' where status = 'HELD'`);
  await db.query(`update "ShiftAssignment" set unavailable = false`);
  // Nobody takes cases unless a test says so.
  await db.query(`update "Staff" set "agentStatus" = 'AWAY' where role = 'AGENT'`);
});

async function patient(who: keyof typeof PEOPLE) {
  const b = browser();
  await b("/auth/patient/login", PEOPLE[who]);
  return { b, me: (await b("/auth/me")).body };
}

/** Red flag A2 Yes: Urgent, routed to Kacyiru's emergency clinician with a held bed. */
async function urgent() {
  const { b, me } = await patient("aline");
  const id = (await b("/cases", { subjectId: me.id, location: KIGALI })).body.id as string;
  let v = (await b(`/cases/${id}`)).body;
  if (v.stage === "PREGNANCY") v = (await b(`/cases/${id}/pregnancy`, { pregnant: false })).body;
  v = (await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: false })).body;
  await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: true });
  const r = await one(`select id from "Routing" where "caseId" = $1 and status = 'SUGGESTED'`, [id]);
  return { b, caseId: id, routingId: r.id as string };
}

/** A waiting case: "cough" is too short to judge, so Uncertain; anything longer and the stand-in AI says Minor. */
async function waiting(kind: "uncertain" | "minor", who: keyof typeof PEOPLE = "claudine") {
  const { b, me } = await patient(who);
  const id = (await b("/cases", { subjectId: me.id, location: KIGALI })).body.id as string;
  let v = (await b(`/cases/${id}`)).body;
  if (v.stage === "PREGNANCY") v = (await b(`/cases/${id}/pregnancy`, { pregnant: false })).body;
  while (v.stage === "RED_FLAGS") v = (await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: false })).body;
  await b(`/cases/${id}/symptoms`, { description: kind === "uncertain" ? "cough" : "I have had a dry cough and a mild fever since yesterday evening", duration: "TODAY", severity: 3 });
  return { b, id };
}

describe("routings and beds over time (FR 5.11, 5.7)", () => {
  it("expires a routing with no arrival after 24 hours, releases its bed and drops it from the incoming list", async () => {
    const { routingId } = await urgent();
    await db.query(`update "Routing" set "createdAt" = (now() at time zone 'utc') - interval '25 hours' where id = $1`, [routingId]);
    const r = await until(async () => {
      const x = await one(`select r.status, b.status as bed from "Routing" r left join "BedReservation" b on b."routingId" = r.id where r.id = $1`, [routingId]);
      return x.status === "EXPIRED" && x;
    });
    expect(r.bed).toBe("RELEASED");
    expect((await er("/clinician/patients")).body.incoming.find((x: { id: string }) => x.id === routingId)).toBeUndefined();
    expect((await er(`/clinician/incoming/${routingId}/arrive`, {})).status).toBe(404); // no records unlocked
    expect(await one(`select count(*)::int as n from "AuditEvent" where action = 'routing.expired' and detail->>'routingId' = $1`, [routingId])).toEqual({ n: 1 });
  });

  it("releases a held bed after 6 hours, while the routing stays valid", async () => {
    const { routingId } = await urgent();
    await db.query(`update "BedReservation" set "releaseAfter" = (now() at time zone 'utc') - interval '1 minute' where "routingId" = $1`, [routingId]);
    const b = await until(async () => {
      const x = await one(`select status, "releaseReason" from "BedReservation" where "routingId" = $1`, [routingId]);
      return x.status === "RELEASED" && x;
    });
    expect(b.releaseReason).toContain("6 hours");
    expect((await one(`select status from "Routing" where id = $1`, [routingId])).status).toBe("SUGGESTED");
  });
});

describe("the attending clinician's shift ends (FR 5.13)", () => {
  it("sends the patient back to the agents when nobody of that specialty is on duty", async () => {
    const { caseId, routingId } = await urgent();
    // The emergency clinician's shift is over: no assignment for the shift that is on now.
    await db.query(`delete from "ShiftAssignment" where "staffId" = (select id from "Staff" where email = 'clinician@ubuzima.test') and date = $1::date and shift = $2::"ShiftType"`, [now.date, now.shift]);
    const r = await until(async () => {
      const x = await one(`select r."clinicianId", c.status, c."frontOfQueue" from "Routing" r join "Case" c on c.id = r."caseId" where r.id = $1`, [routingId]);
      return x.clinicianId === null && x;
    });
    expect(r).toMatchObject({ status: "QUEUED", frontOfQueue: true });
    expect(await one(`select detail->>'why' as why from "AuditEvent" where action = 'routing.no_clinician' and detail->>'routingId' = $1`, [routingId])).toEqual({ why: "Shift ended" });
    expect(caseId).toBeTruthy();
    await db.query(`insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById") select gen_random_uuid(), id, $1::date, $2::"ShiftType", id from "Staff" where email = 'clinician@ubuzima.test' on conflict do nothing`, [now.date, now.shift]);
  });
});

describe("escalation (FR 6.10, 6.11)", () => {
  it("alerts agents and the administrator after 2 minutes, then emails and shows the patient a facility after 5", async () => {
    const { b, id } = await waiting("uncertain");
    expect((await one(`select "triageLevel" from "Case" where id = $1`, [id])).triageLevel).toBe("UNCERTAIN");

    await db.query(`update "Case" set "queuedAt" = (now() at time zone 'utc') - interval '3 minutes' where id = $1`, [id]);
    await until(async () => (await one(`select "escalationLevel" from "Case" where id = $1`, [id])).escalationLevel === 1);
    expect(await one(`select kind from "Alert" where "caseId" = $1`, [id])).toEqual({ kind: "ESCALATION" });

    // An agent comes back, so FR 6.13 doesn't apply; only the 5-minute rule shows the facility.
    await db.query(`update "Staff" set "agentStatus" = 'BUSY', "lastSeenAt" = (now() at time zone 'utc') + interval '1 hour' where email = 'agent2@ubuzima.test'`);
    await db.query(`update "Case" set "queuedAt" = (now() at time zone 'utc') - interval '6 minutes' where id = $1`, [id]);
    await until(async () => (await one(`select "escalationLevel" from "Case" where id = $1`, [id])).escalationLevel === 2);
    const incident = await one(`select emailed from "Alert" where "caseId" = $1 and kind = 'DELAY_INCIDENT'`, [id]);
    expect(incident.emailed).toBe(true);
    expect((await one(`select subject from "EmailMessage" where "to" = 'admin@ubuzima.test' order by "createdAt" desc limit 1`)).subject).toContain("Delay incident");
    expect(await one(`select count(*)::int as n from "AuditEvent" where action = 'case.delay_incident' and detail->>'caseId' = $1`, [id])).toEqual({ n: 1 });
    const v = (await b(`/cases/${id}`)).body;
    expect(v).toMatchObject({ delayed: true, noAgent: false });
    expect(v.guidance.facility.name).toBeTruthy();

    // The alerts repeat every 2 minutes until someone accepts.
    await db.query(`update "Case" set "escalatedAt" = (now() at time zone 'utc') - interval '3 minutes' where id = $1`, [id]);
    await until(async () => (await one(`select count(*)::int as n from "Alert" where "caseId" = $1 and kind = 'DELAY_INCIDENT'`, [id])).n === 2);
  });

  it("starts the clock again when a case goes back to the queue", async () => {
    const { id } = await waiting("uncertain");
    await db.query(`update "Case" set "queuedAt" = (now() at time zone 'utc') - interval '3 minutes', "escalationLevel" = 1, status = 'ASSIGNED', "agentId" = (select id from "Staff" where email = 'agent@ubuzima.test'), "assignedAt" = (now() at time zone 'utc') where id = $1`, [id]);
    await db.query(`update "Staff" set "agentStatus" = 'BUSY', "lastSeenAt" = (now() at time zone 'utc') + interval '1 hour' where email = 'agent@ubuzima.test'`);
    expect((await agent(`/agent/cases/${id}/release`, {})).status).toBe(200);
    const c = await one(`select "escalationLevel", "queuedAt" > (now() at time zone 'utc') - interval '10 seconds' as fresh from "Case" where id = $1`, [id]);
    expect(c).toEqual({ escalationLevel: 0, fresh: true });
  });
});

describe("no agent online (FR 6.13)", () => {
  it("tells patients what to do, and the administrator after 5 minutes", async () => {
    await db.query(`update "Staff" set "agentStatus" = 'OFFLINE' where role = 'AGENT'`);
    const minor = await waiting("minor");
    expect((await minor.b(`/cases/${minor.id}`)).body).toMatchObject({ noAgent: true, guidance: null });
    const uncertain = await waiting("uncertain", "aline"); // one open case per person
    const u = (await uncertain.b(`/cases/${uncertain.id}`)).body;
    expect(u.noAgent).toBe(true);
    expect(u.guidance.facility.name).toBeTruthy();

    await until(async () => (await one(`select "noAgentSince" from "SystemSettings" where id = 1`))?.noAgentSince);
    await db.query(`update "SystemSettings" set "noAgentSince" = (now() at time zone 'utc') - interval '6 minutes', "noAgentAlerted" = false where id = 1`);
    const alert = await until(async () => one(`select emailed from "Alert" where kind = 'NO_AGENT'`));
    expect(alert.emailed).toBe(true);

    // Once an agent is online again, the clock resets.
    await db.query(`update "Staff" set "agentStatus" = 'BUSY', "lastSeenAt" = (now() at time zone 'utc') + interval '1 hour' where email = 'agent2@ubuzima.test'`);
    await until(async () => (await one(`select "noAgentSince" from "SystemSettings" where id = 1`)).noAgentSince === null);
  });
});

describe("administrator alerts (FR 12.7, 4.7, 5.9)", () => {
  it("raises one alert for more than 5 AI failures in 5 minutes", async () => {
    for (let i = 0; i < 6; i++) await db.query(`insert into "AuditEvent" (id, "actorType", action, "createdAt") values (gen_random_uuid(), 'system', 'ai.failure', (now() at time zone 'utc'))`);
    await until(async () => one(`select 1 as ok from "Alert" where kind = 'AI_FAILURES'`));
    await wait(1000);
    expect(await one(`select count(*)::int as n from "Alert" where kind = 'AI_FAILURES'`)).toEqual({ n: 1 });
  });

  it("raises a no-capacity alert when no facility can take a case", async () => {
    await db.query(`update "ShiftAssignment" set unavailable = true where date = $1::date and shift = $2::"ShiftType"`, [now.date, now.shift]);
    const { id } = await waiting("minor");
    expect(await one(`select kind from "Alert" where "caseId" = $1`, [id])).toEqual({ kind: "NO_CAPACITY" });
  });

  it("lists alerts for the administrator only, and marks them read", async () => {
    const list = (await admin("/alerts")).body;
    expect(list.alerts.length).toBeGreaterThan(0);
    expect(list.unread).toBeGreaterThan(0);
    expect((await admin("/alerts/read", {})).status).toBe(200);
    expect((await admin("/alerts")).body.unread).toBe(0);
    expect((await agent("/alerts")).status).toBe(403);
  });
});
