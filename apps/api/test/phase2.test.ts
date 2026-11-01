import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const CLAUDINE = { nationalId: "1199670078215135", dateOfBirth: "1996-04-18", name: "Claudine" };
const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" };
type Browser = ReturnType<typeof browser>;

let gemini: ReturnType<typeof startFakeGemini>;
let clinician: Browser;
let manager: Browser;
let admin: Browser;
let agent: Browser;
let ids: Record<string, string>;
const now = currentShift();

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role in ('CLINICIAN', 'AGENT') on conflict do nothing`,
    [now.date, now.shift],
  );
  ids = Object.fromEntries(
    (await db.query(`select id, email from "Staff"`)).rows.map((member) => [member.email.split("@")[0], member.id]),
  );
  [clinician, manager, admin, agent] = await Promise.all(
    ["clinician", "manager", "admin", "agent"].map((name) => staffLogin(`${name}@ubuzima.test`)),
  );
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
});

async function logInAs(who: typeof ALINE) {
  const patient = browser();
  await patient("/auth/patient/login", who);
  return { patient, me: (await patient("/auth/me")).body };
}

/** Red flag A2 Yes: Urgent, routed at once to Kacyiru's emergency care with a held bed. */
async function urgent() {
  const { patient, me } = await logInAs(ALINE);
  const id = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id as string;
  let view = (await patient(`/cases/${id}`)).body;
  if (view.stage === "PREGNANCY") view = (await patient(`/cases/${id}/pregnancy`, { pregnant: false })).body;
  view = (await patient(`/cases/${id}/answers`, { questionId: view.question.id, answer: false })).body;
  await patient(`/cases/${id}/answers`, { questionId: view.question.id, answer: true });
  const routing = (
    await db.query(`select id, "clinicianId" from "Routing" where "caseId" = $1 and status = 'SUGGESTED'`, [id])
  ).rows[0];
  return { patient, caseId: id, routingId: routing.id as string, clinicianId: routing.clinicianId as string };
}

describe("no facility can take the case (FR 5.9)", () => {
  it("makes a minor case Urgent, shows 912, and logs it", async () => {
    // Nobody is on duty anywhere right now.
    await db.query(
      `update "ShiftAssignment" set unavailable = true where date = $1::date and shift = $2::"ShiftType"`,
      [now.date, now.shift],
    );
    const { patient, me } = await logInAs(CLAUDINE);
    const id = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    let view = (await patient(`/cases/${id}`)).body;
    if (view.stage === "PREGNANCY") view = (await patient(`/cases/${id}/pregnancy`, { pregnant: false })).body;
    while (view.stage === "RED_FLAGS")
      view = (await patient(`/cases/${id}/answers`, { questionId: view.question.id, answer: false })).body;
    view = (
      await patient(`/cases/${id}/symptoms`, {
        description: "I have had a dry cough and a mild fever since yesterday evening",
        duration: "TODAY",
        severity: 3,
      })
    ).body;
    expect(view.urgent).toBe(true);
    expect(view.guidance).toMatchObject({ facility: null });
    const found = (await db.query(`select "triageLevel", "triageReason", status from "Case" where id = $1`, [id]))
      .rows[0];
    expect(found).toMatchObject({
      triageLevel: "URGENT",
      status: "QUEUED",
      triageReason: expect.stringContaining("No facility offers"),
    });
    const log = await db.query(
      `select 1 from "AuditEvent" where action = 'routing.no_match' and detail->>'caseId' = $1`,
      [id],
    );
    expect(log.rowCount).toBe(1);
  });
});

describe("automatic reassignment (FR 5.13, 8.5)", () => {
  it("gives a patient on the way to a colleague when the clinician marks the current shift unavailable", async () => {
    // A second emergency clinician at Kacyiru, on duty now.
    const extra = (
      await db.query(
        `insert into "Staff" (id, email, name, role, status, specialty, "facilityId")
         values (gen_random_uuid(), 'er2@ubuzima.test', 'Dr. Ines Mutesi', 'CLINICIAN', 'ACTIVE', 'EMERGENCY_CARE', (select "facilityId" from "Staff" where email = 'clinician@ubuzima.test'))
         on conflict (email) do update set status = 'ACTIVE' returning id`,
      )
    ).rows[0].id as string;
    await db.query(
      `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById") values (gen_random_uuid(), $1, $2::date, $3::"ShiftType", $1) on conflict do nothing`,
      [extra, now.date, now.shift],
    );

    const { routingId, clinicianId } = await urgent();
    const assigned = clinicianId === ids.clinician ? clinician : null;
    expect(assigned).not.toBeNull(); // the fewest patients: the seeded clinician
    const shift = (
      await db.query(
        `select id from "ShiftAssignment" where "staffId" = $1 and date = $2::date and shift = $3::"ShiftType"`,
        [ids.clinician, now.date, now.shift],
      )
    ).rows[0].id;
    expect(
      (await clinician(`/me/shifts/${shift}/unavailable`, { unavailable: true, reason: "Called to theatre" })).status,
    ).toBe(200);

    const routing = (await db.query(`select "clinicianId" from "Routing" where id = $1`, [routingId])).rows[0];
    expect(routing.clinicianId).toBe(extra);
    const notice = await db.query(`select kind from "Notification" where "staffId" = $1 and "routingId" = $2`, [
      extra,
      routingId,
    ]);
    expect(notice.rows).toEqual([{ kind: "INCOMING" }]);
    const log = await db.query(
      `select detail->>'why' as why from "AuditEvent" where action = 'routing.clinician_reassigned' and detail->>'routingId' = $1`,
      [routingId],
    );
    expect(log.rows[0].why).toBe("Clinician marked unavailable");

    // Deactivated next, with nobody of that specialty left on duty: the case goes back to the agents, first in line.
    expect((await manager(`/clinicians/${extra}/deactivate`, {})).status).toBe(200);
    const after = (
      await db.query(
        `select r."clinicianId", c.status, c."frontOfQueue" from "Routing" r join "Case" c on c.id = r."caseId" where r.id = $1`,
        [routingId],
      )
    ).rows[0];
    expect(after).toEqual({ clinicianId: null, status: "QUEUED", frontOfQueue: true });
  });
});

describe("bed counts (FR 8.3)", () => {
  it("counts held beds as reserved and used ones as occupied, and won't let the total go below them", async () => {
    const before = (await manager("/facilities/mine")).body;
    const { routingId } = await urgent();
    const held = (await manager("/facilities/mine")).body;
    expect(held.reservedBeds).toBe(before.reservedBeds + 1);
    expect(held.availableBeds).toBe(before.availableBeds - 1);
    await clinician(`/clinician/incoming/${routingId}/arrive`, {});
    const used = (await manager("/facilities/mine")).body;
    expect(used).toMatchObject({ occupiedBeds: before.occupiedBeds + 1, reservedBeds: before.reservedBeds });
    const inUse = used.occupiedBeds + used.reservedBeds;
    expect((await manager("/facilities/mine/beds", { totalBeds: inUse - 1 }, "PUT")).status).toBe(400);
  });
});

describe("the audit log can't be changed (NFR 9)", () => {
  it("refuses updates and deletes in the database itself", async () => {
    await expect(db.query(`update "AuditEvent" set action = 'x'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from "AuditEvent"`)).rejects.toThrow(/append-only/);
  });
});

describe("who can open what (FR 9.1 to 9.5)", () => {
  it("keeps patient medical records away from managers, administrators and the wrong staff", async () => {
    const { routingId, caseId } = await urgent();
    const { me } = await logInAs(ALINE);
    for (const who of [manager, admin]) {
      for (const path of [
        `/clinician/visits/${routingId}`,
        `/clinician/incoming/${routingId}`,
        `/agent/cases/${caseId}`,
        `/records/${me.id}`,
        "/prescriptions/mine",
      ]) {
        expect((await who(path)).status, path).toBe(403);
      }
    }
    // Staff of one role can't use another role's screens.
    expect((await agent("/clinician/patients")).status).toBe(403);
    expect((await clinician("/agent/state")).status).toBe(403);
    expect((await clinician("/on-duty")).status).toBe(403);
    expect((await manager("/staff")).status).toBe(403);
    // Patients reach none of the staff screens.
    const { patient } = await logInAs(CLAUDINE);
    for (const path of ["/staff", "/activity", "/agent/state", "/clinician/patients", `/records/${me.id}`]) {
      expect((await patient(path)).status, path).toBe(403);
    }
  });
});
