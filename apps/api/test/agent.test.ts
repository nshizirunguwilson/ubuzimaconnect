import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const PEOPLE = {
  aline: { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" },
  eric: { nationalId: "1200180054377109", dateOfBirth: "2001-09-30", name: "Eric" },
  claudine: { nationalId: "1199670078215135", dateOfBirth: "1996-04-18", name: "Claudine" },
  esperance: { nationalId: "1196070012689241", dateOfBirth: "1960-12-25", name: "Esperance" },
};
type Who = keyof typeof PEOPLE;
type B = ReturnType<typeof browser>;

let gemini: ReturnType<typeof startFakeGemini>;
let agent: B;
let agent2: B;

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

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  const { date, shift } = currentShift();
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role = 'CLINICIAN' on conflict do nothing`,
    [date, shift],
  );
  agent = await staffLogin("agent@ubuzima.test");
  agent2 = await staffLogin("agent2@ubuzima.test");
});
afterAll(async () => {
  await gemini.close();
  await db.end();
});

// Each test starts with no open cases and both agents Away.
beforeEach(async () => {
  await db.query(`update "Case" set status = 'CLOSED', outcome = 'CANCELLED_BY_PATIENT', "agentId" = null, "offeredToId" = null where status <> 'CLOSED'`);
  await db.query(`update "BedReservation" set status = 'RELEASED' where status = 'HELD'`);
  await agent("/agent/status", { status: "AWAY" }, "PUT");
  await agent2("/agent/status", { status: "AWAY" }, "PUT");
});

async function patient(who: Who) {
  const b = browser();
  await b("/auth/patient/login", PEOPLE[who]);
  const me = (await b("/auth/me")).body;
  return { b, me };
}

/** A queued case: "minor" (AI minor/high), "urgent" (red flag A2 Yes) or "uncertain" (short description). */
async function caseFor(who: Who, kind: "minor" | "urgent" | "uncertain") {
  const { b, me } = await patient(who);
  const id = (await b("/cases", { subjectId: me.id, location: KIGALI })).body.id;
  let v = (await b(`/cases/${id}`)).body;
  if (v.stage === "PREGNANCY") v = (await b(`/cases/${id}/pregnancy`, { pregnant: false })).body;
  if (kind === "urgent") {
    v = (await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: false })).body;
    await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: true });
  } else {
    while (v.stage === "RED_FLAGS") v = (await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: false })).body;
    const description = kind === "minor" ? "I have had a dry cough and a mild fever since yesterday evening" : "cough";
    await b(`/cases/${id}/symptoms`, { description, duration: "TODAY", severity: 3 });
  }
  return { b, id, me };
}

const offerFor = (a: B) => until(async () => (await a("/agent/state")).body.offer);

async function acceptNext(a: B) {
  await a("/agent/status", { status: "AVAILABLE" }, "PUT");
  const offer = await offerFor(a);
  expect((await a(`/agent/offers/${offer.id}/accept`, {})).status).toBe(200);
  return offer.id as string;
}

describe("queue and offers (FR 6.1 to 6.4, 4.9)", () => {
  it("offers Urgent before Minor, without the patient's name", async () => {
    await caseFor("claudine", "minor");
    const urgent = await caseFor("esperance", "urgent");
    await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
    const offer = await offerFor(agent);
    expect(offer).toMatchObject({ id: urgent.id, level: "URGENT", redFlag: "A2" });
    expect(JSON.stringify(offer)).not.toContain("Esperance");
  });

  it("offers to the next agent when one lets it pass, and lets only one accept (FR 6.3)", async () => {
    const c = await caseFor("claudine", "minor");
    await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
    const first = await offerFor(agent);
    expect(first.id).toBe(c.id);
    await agent2("/agent/status", { status: "AVAILABLE" }, "PUT");
    await agent(`/agent/offers/${c.id}/decline`, {});
    const second = await offerFor(agent2);
    expect(second.id).toBe(c.id);
    expect((await agent(`/agent/offers/${c.id}/accept`, {})).status).toBe(409);
    expect((await agent2(`/agent/offers/${c.id}/accept`, {})).status).toBe(200);
  });

  it("moves an offer on after the time runs out (30 s in production)", async () => {
    const c = await caseFor("claudine", "minor");
    await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
    await agent2("/agent/status", { status: "AVAILABLE" }, "PUT");
    const offeredTo = async () => (await db.query(`select "offeredToId" from "Case" where id = $1`, [c.id])).rows[0].offeredToId as string | null;
    const first = await until(offeredTo);
    // Nobody accepts: after the offer time it goes to the other Available agent.
    await until(async () => {
      const now = await offeredTo();
      return now && now !== first;
    }, 8000);
  });

  it("gives one active case per agent and keeps a Busy agent from going Away (FR 6.4, 6.16)", async () => {
    await caseFor("claudine", "minor");
    await caseFor("eric", "minor");
    await acceptNext(agent);
    expect((await agent("/agent/state")).body.status).toBe("BUSY");
    await wait(800);
    expect((await agent("/agent/state")).body.offer).toBeNull();
    expect((await agent("/agent/status", { status: "AWAY" }, "PUT")).status).toBe(409);
  });
});

describe("handling a case (FR 6.5 to 6.9, 6.15, 9.2)", () => {
  it("shows the full case only to the agent handling it", async () => {
    const c = await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    expect(id).toBe(c.id);
    const view = (await agent(`/agent/cases/${id}`)).body;
    expect(view).toMatchObject({ patient: { name: "Claudine Uwimana" }, ai: { urgency: "MINOR" } });
    expect((await agent2(`/agent/cases/${id}`)).status).toBe(403);
  });

  it("saves every triage change with the agent and the time (FR 6.5)", async () => {
    await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    const r = await agent(`/agent/cases/${id}/triage`, { triageLevel: "UNCERTAIN", category: "RESPIRATORY", neededService: "INTERNAL_MEDICINE", bedNeeded: false }, "PUT");
    expect(r.body.changed).toBeGreaterThanOrEqual(2);
    const rows = (await db.query(`select field, "toValue", "staffId" from "CaseChange" where "caseId" = $1`, [id])).rows;
    expect(rows.map((x) => x.field)).toEqual(expect.arrayContaining(["triageLevel", "neededService"]));
    expect(rows.every((x) => x.staffId)).toBe(true);
  });

  it("delivers chat both ways live, within 3 seconds (FR 6.6)", async () => {
    const c = await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    // The patient's live stream, opened like the browser does.
    const cookie = await patientCookie("claudine");
    const ctrl = new AbortController();
    const res = await fetch(`${API}/events/cases/${id}`, { headers: { cookie }, signal: ctrl.signal });
    const reader = res.body!.getReader();
    const sentAt = Date.now();
    await agent(`/agent/cases/${id}/messages`, { text: "Hello, how high is the fever?" });
    let got = "";
    while (!got.includes("how high is the fever")) got += new TextDecoder().decode((await reader.read()).value);
    expect(Date.now() - sentAt).toBeLessThan(3000);
    ctrl.abort();
    expect((await c.b(`/cases/${id}/messages`, { text: "Better" })).status).toBe(201);
    const messages = (await agent(`/agent/cases/${id}`)).body.messages.map((m: { sender: string }) => m.sender);
    expect(messages).toEqual(expect.arrayContaining(["SYSTEM", "AGENT", "PATIENT"]));
  });

  it("asks for the date of birth when the number isn't the patient's, and closes after 3 missed calls (FR 6.7)", async () => {
    const { b, me } = await patient("eric");
    const r = await b("/cases/call", { subjectId: me.id, number: "0788123456", owner: "SOMEONE_ELSE" });
    const id = await acceptNext(agent);
    expect(id).toBe(r.body.id);
    expect((await agent(`/agent/cases/${id}/calls`, { answered: true, note: "Talked" })).status).toBe(400);
    for (let i = 0; i < 2; i++) expect((await agent(`/agent/cases/${id}/calls`, { answered: false, note: "No answer" })).body.closed).toBe(false);
    expect((await agent(`/agent/cases/${id}/calls`, { answered: false, note: "No answer" })).body.closed).toBe(true);
    expect((await db.query(`select outcome from "Case" where id = $1`, [id])).rows[0].outcome).toBe("NO_RESPONSE");
  });

  it("refuses No response for a Minor case the patient answered recently (FR 6.9)", async () => {
    await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    expect((await agent(`/agent/cases/${id}/close`, { outcome: "NO_RESPONSE", note: "Silent" })).status).toBe(409);
  });

  it("closes with an outcome and note, ends the agent's access, and lets the patient rate once (FR 6.15)", async () => {
    const c = await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    expect((await agent(`/agent/cases/${id}/close`, { outcome: "ADVISED_REMOTELY", note: "Fluids, rest, come back if worse." })).status).toBe(200);
    expect((await agent(`/agent/cases/${id}`)).status).toBe(403);
    expect((await agent("/agent/state")).body.status).toBe("AVAILABLE");
    expect((await c.b(`/cases/${id}/rating`, { rating: 5 })).body.rating).toBe(5);
    expect((await c.b(`/cases/${id}/rating`, { rating: 1 })).status).toBe(409);
  });
});

describe("routing (FR 5.5 to 5.12)", () => {
  it("routes a red-flag case at once: nearest suitable facility, a held bed and a clinician (FR 5.7, 5.12)", async () => {
    const c = await caseFor("esperance", "urgent");
    const r = (await db.query(`select status, "bedNeeded", "clinicianId", "facilityId" from "Routing" where "caseId" = $1`, [c.id])).rows[0];
    expect(r).toMatchObject({ status: "SUGGESTED", bedNeeded: true });
    expect(r.clinicianId).toBeTruthy();
    const held = (await db.query(`select count(*)::int n from "BedReservation" br join "Routing" r on r.id = br."routingId" where r."caseId" = $1 and br.status = 'HELD'`, [c.id])).rows[0].n;
    expect(held).toBe(1);
  });

  it("confirms the suggestion for 24 hours, keeping its bed", async () => {
    const c = await caseFor("esperance", "urgent");
    const id = await acceptNext(agent);
    expect(id).toBe(c.id);
    const opts = (await agent(`/agent/cases/${id}/routing-options?service=EMERGENCY_CARE&bedNeeded=true`)).body;
    expect(opts.kind).toBe("SUITABLE");
    expect((await agent(`/agent/cases/${id}/routing`, { facilityId: opts.nearestId, bedNeeded: true })).status).toBe(201);
    const r = (await db.query(`select status, "expiresAt" - "confirmedAt" as valid from "Routing" where "caseId" = $1 and status = 'CONFIRMED'`, [id])).rows[0];
    expect(r.valid.hours ?? r.valid.days * 24).toBe(24);
    const held = (await db.query(`select count(*)::int n from "BedReservation" br join "Routing" r on r.id = br."routingId" where r."caseId" = $1 and br.status = 'HELD'`, [id])).rows[0].n;
    expect(held).toBe(1);
  });

  it("needs a reason for a facility that isn't the nearest, and releases the old bed when changed (FR 5.6, 5.10)", async () => {
    const c = await caseFor("esperance", "urgent");
    const id = await acceptNext(agent);
    expect(id).toBe(c.id);
    const opts = (await agent(`/agent/cases/${id}/routing-options?service=EMERGENCY_CARE&bedNeeded=true`)).body;
    const other = opts.facilities.find((f: { id: string; suitable: boolean }) => f.suitable && f.id !== opts.nearestId);
    expect(other).toBeDefined();
    expect((await agent(`/agent/cases/${id}/routing`, { facilityId: other.id, bedNeeded: true })).body.fields).toHaveProperty("reason");
    expect((await agent(`/agent/cases/${id}/routing`, { facilityId: other.id, bedNeeded: true, reason: "Family lives nearby" })).status).toBe(201);
    const rows = (await db.query(`select r.status, br.status as bed from "Routing" r left join "BedReservation" br on br."routingId" = r.id where r."caseId" = $1 order by r."createdAt"`, [id])).rows;
    expect(rows[0]).toEqual({ status: "CHANGED", bed: "RELEASED" });
    expect(rows[1]).toEqual({ status: "CONFIRMED", bed: "HELD" });
  });

  it("counts held beds against the facility's free beds (FR 8.3)", async () => {
    const manager = await staffLogin("manager@ubuzima.test");
    const before = (await manager("/facilities/mine")).body;
    await db.query(
      `update "Facility" set latitude = -1.9501, longitude = 30.0901 where id = $1`,
      [before.id],
    );
    await caseFor("esperance", "urgent");
    const after = (await manager("/facilities/mine")).body;
    expect(after.reservedBeds).toBe(before.reservedBeds + 1);
    expect(after.availableBeds).toBe(before.availableBeds - 1);
  });

  it("releases the bed and frees the agent when the patient cancels (FR 3.11)", async () => {
    const c = await caseFor("esperance", "urgent");
    await acceptNext(agent);
    await c.b(`/cases/${c.id}/cancel`, {});
    const bed = (await db.query(`select br.status from "BedReservation" br join "Routing" r on r.id = br."routingId" where r."caseId" = $1`, [c.id])).rows[0];
    expect(bed.status).toBe("RELEASED");
    expect((await agent("/agent/state")).body.status).toBe("AVAILABLE");
  });
});

describe("pause, release and lost connection (FR 6.12, 6.14, 6.16, 12.2)", () => {
  it("returns a released case to the front of its level", async () => {
    await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    await agent(`/agent/cases/${id}/release`, {});
    expect((await db.query(`select status, "frontOfQueue" from "Case" where id = $1`, [id])).rows[0]).toEqual({ status: "QUEUED", frontOfQueue: true });
  });

  it("lets a Busy agent pause a Minor case for one waiting past the level 1 alert", async () => {
    await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    const urgent = await caseFor("esperance", "urgent");
    expect((await agent(`/agent/cases/${id}/pause`, {})).status).toBe(409); // not waited 2 minutes yet
    await db.query(`update "Case" set "queuedAt" = now() at time zone 'utc' - interval '3 minutes' where id = $1`, [urgent.id]);
    expect((await agent(`/agent/cases/${id}/pause`, {})).body.next).toBe(urgent.id);
    const paused = (await db.query(`select status, "frontOfQueue" from "Case" where id = $1`, [id])).rows[0];
    expect(paused).toEqual({ status: "QUEUED", frontOfQueue: true });
    const msg = (await db.query(`select text from "ChatMessage" where "caseId" = $1 order by "createdAt" desc limit 1`, [id])).rows[0].text;
    expect(msg).toContain("called to an emergency");
  });

  it("marks an agent Offline after 60 s without a connection and returns their case (FR 6.14)", async () => {
    await caseFor("claudine", "minor");
    const id = await acceptNext(agent);
    await db.query(`update "Staff" set "lastSeenAt" = now() at time zone 'utc' - interval '2 minutes' where email = 'agent@ubuzima.test'`);
    await until(async () => (await db.query(`select status from "Case" where id = $1`, [id])).rows[0].status === "QUEUED" || (await db.query(`select status from "Case" where id = $1`, [id])).rows[0].status === "OFFERED");
    const msg = (await db.query(`select text from "ChatMessage" where "caseId" = $1 order by "createdAt" desc limit 1`, [id])).rows[0].text;
    expect(msg).toBe("Another agent will continue with you.");
    expect((await db.query(`select "agentStatus" from "Staff" where email = 'agent@ubuzima.test'`)).rows[0].agentStatus).toBe("OFFLINE");
  });
});

async function patientCookie(who: Who) {
  const res = await fetch(`${API}/auth/patient/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(PEOPLE[who]) });
  return res.headers.get("set-cookie")!.split(";")[0];
}
