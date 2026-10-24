import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" };
type B = ReturnType<typeof browser>;

let gemini: ReturnType<typeof startFakeGemini>;
let er: B; // Dr. Samuel Mugisha, emergency care, Kacyiru
let paeds: B; // Kacyiru, another specialty
let gp: B; // Kacyiru
let kibEr: B; // Kibagabaga, emergency care
let ids: Record<string, string>;

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  const { date, shift } = currentShift();
  // Every clinician on duty now, so the tests don't depend on the time of day.
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role = 'CLINICIAN' on conflict do nothing`,
    [date, shift],
  );
  const staff = await db.query(`select id, email from "Staff"`);
  ids = Object.fromEntries(staff.rows.map((r) => [r.email.split("@")[0], r.id]));
  [er, paeds, gp, kibEr] = await Promise.all(["clinician", "paeds", "gp", "kib.er"].map((n) => staffLogin(`${n}@ubuzima.test`)));
});
afterAll(async () => {
  await gemini.close();
  await db.end();
});
beforeEach(async () => {
  await db.query(`update "Routing" set status = 'CANCELLED' where status in ('SUGGESTED', 'CONFIRMED', 'ARRIVED')`);
  await db.query(`update "BedReservation" set status = 'RELEASED' where status = 'HELD'`);
  await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
  await db.query(`update "Facility" set "totalBeds" = 120 where name like 'Kacyiru%'`);
});

/** A red-flag case (A2 Yes): routed at once to Kacyiru, with a held bed and the emergency clinician (FR 5.5, 5.7, 5.12). */
async function urgentCase() {
  // One open case per person: close the previous test case first (its routing stays as it is).
  await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
  const b = browser();
  await b("/auth/patient/login", ALINE);
  const me = (await b("/auth/me")).body;
  const id = (await b("/cases", { subjectId: me.id, location: KIGALI })).body.id;
  let v = (await b(`/cases/${id}`)).body;
  if (v.stage === "PREGNANCY") v = (await b(`/cases/${id}/pregnancy`, { pregnant: false })).body;
  v = (await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: false })).body;
  await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: true });
  const r = await db.query(`select id from "Routing" where "caseId" = $1 and status = 'SUGGESTED'`, [id]);
  return { b, caseId: id, routingId: r.rows[0].id as string };
}

async function arrived() {
  const c = await urgentCase();
  expect((await er(`/clinician/incoming/${c.routingId}/arrive`, {})).status).toBe(200);
  return c;
}

const usedBeds = async () =>
  Number((await db.query(`select count(*) from "BedReservation" b join "Routing" r on r.id = b."routingId" where b.status = 'USED' and r.status = 'ARRIVED'`)).rows[0].count);

describe("incoming patients (FR 7.4, 5.12)", () => {
  it("tells the assigned clinician and shows a summary to every on-duty clinician at the facility", async () => {
    const { routingId } = await urgentCase();
    const notice = await db.query(`select kind from "Notification" where "staffId" = $1 and "routingId" = $2`, [ids.clinician, routingId]);
    expect(notice.rows).toEqual([{ kind: "INCOMING" }]);

    const mine = (await er("/clinician/patients")).body;
    const row = mine.incoming.find((x: { id: string }) => x.id === routingId);
    expect(row).toMatchObject({ level: "URGENT", service: expect.any(String), sex: "FEMALE", age: expect.stringMatching(/years/), isNew: true, attending: { me: true } });
    expect(row.redFlags.length).toBe(1);
    // A summary only: no name or national ID before arrival.
    expect(JSON.stringify(row)).not.toMatch(/Aline|Uwase|1199/);

    const other = (await paeds("/clinician/patients")).body;
    expect(other.incoming.find((x: { id: string }) => x.id === routingId)).toMatchObject({ attending: { me: false }, isNew: false });
    expect((await kibEr("/clinician/patients")).body.incoming.find((x: { id: string }) => x.id === routingId)).toBeUndefined();

    // Opening it marks the notice read.
    await er(`/clinician/incoming/${routingId}`);
    expect((await er("/clinician/patients")).body.incoming.find((x: { id: string }) => x.id === routingId).isNew).toBe(false);
  });

  it("shows nothing to a clinician who is off duty", async () => {
    const { routingId } = await urgentCase();
    await db.query(`update "ShiftAssignment" set unavailable = true where "staffId" = $1`, [ids.gp]);
    const off = (await gp("/clinician/patients")).body;
    expect(off).toMatchObject({ onDuty: false, incoming: [] });
    expect((await gp(`/clinician/incoming/${routingId}`)).status).toBe(403);
    await db.query(`update "ShiftAssignment" set unavailable = false where "staffId" = $1`, [ids.gp]);
  });
});

describe("arrival (FR 7.5)", () => {
  it("records a photo mismatch and leaves the patient incoming", async () => {
    const { routingId } = await urgentCase();
    expect((await er(`/clinician/incoming/${routingId}/issue`, { note: "x" })).status).toBe(400);
    expect((await er(`/clinician/incoming/${routingId}/issue`, { note: "Face doesn't match the ID photo" })).status).toBe(201);
    const r = await db.query(`select status from "Routing" where id = $1`, [routingId]);
    expect(r.rows[0].status).toBe("SUGGESTED");
    expect((await er(`/clinician/incoming/${routingId}`)).body.issues).toHaveLength(1);
  });

  it("starts the visit, turns the held bed into the patient's, and can only happen once", async () => {
    const before = await usedBeds();
    const { b, caseId, routingId } = await urgentCase();
    const res = await er(`/clinician/incoming/${routingId}/arrive`, {});
    expect(res.body).toEqual({ attending: true });
    expect(await usedBeds()).toBe(before + 1);
    const bed = await db.query(`select status from "BedReservation" where "routingId" = $1`, [routingId]);
    expect(bed.rows[0].status).toBe("USED");
    expect((await paeds(`/clinician/incoming/${routingId}/arrive`, {})).status).toBe(404);
    // Nobody had taken it from the queue yet, so it leaves the queue.
    const c = await db.query(`select status, outcome from "Case" where id = $1`, [caseId]);
    expect(c.rows[0]).toEqual({ status: "CLOSED", outcome: "ROUTED_TO_FACILITY" });
    // The patient sees the visit instead of the directions, and can't cancel any more.
    const v = (await b(`/cases/${caseId}`)).body;
    expect(v.visit).toEqual({ facility: "Kacyiru District Hospital", active: true });
    expect(v.guidance).toBeNull();
    expect((await b(`/cases/${caseId}/cancel`, {})).status).toBe(409);
  });
});

describe("the visit (FR 7.6, 7.7, 7.3)", () => {
  it("opens the full record only for the attending clinician", async () => {
    const { routingId } = await arrived();
    const v = await er(`/clinician/visits/${routingId}`);
    expect(v.status).toBe(200);
    expect(v.body.patient.name).toBe("Aline Uwase");
    expect(v.body.bed).toBe("USED");
    expect((await paeds(`/clinician/visits/${routingId}`)).status).toBe(403);
    const audit = await db.query(`select 1 from "AuditEvent" where action = 'record.viewed' and "actorId" = $1 and detail->>'routingId' = $2`, [ids.clinician, routingId]);
    expect(audit.rowCount).toBe(1);
  });

  it("versions every update, keeps earlier versions, and locks entries when the visit ends", async () => {
    const { routingId } = await arrived();
    expect((await er(`/clinician/visits/${routingId}/entries`, {})).status).toBe(400);
    const first = (await er(`/clinician/visits/${routingId}/entries`, { diagnosis: "Acute asthma", treatment: "Salbutamol nebuliser" })).body;
    expect((await er(`/clinician/visits/${routingId}/entries/${first.rootId}`, { diagnosis: "Acute asthma, moderate", treatment: "Salbutamol nebuliser, prednisolone" }, "PUT")).body.version).toBe(2);

    const v = (await er(`/clinician/visits/${routingId}`)).body;
    expect(v.entries).toHaveLength(1);
    expect(v.entries[0].latest).toMatchObject({ version: 2, diagnosis: "Acute asthma, moderate", by: "Dr. Samuel Mugisha" });
    expect(v.entries[0].earlier).toEqual([expect.objectContaining({ version: 1, diagnosis: "Acute asthma" })]);

    expect((await er(`/clinician/visits/${routingId}/finish`, {})).body.status).toBe("DISCHARGED");
    expect((await er(`/clinician/visits/${routingId}/entries/${first.rootId}`, { notes: "late" }, "PUT")).status).toBe(403);
    expect((await er(`/clinician/visits/${routingId}`)).status).toBe(403);
  });

  it("shows entries from earlier visits on the next one (FR 7.3)", async () => {
    const one = await arrived();
    await er(`/clinician/visits/${one.routingId}/entries`, { notes: "Known asthmatic" });
    await er(`/clinician/visits/${one.routingId}/finish`, {});
    const two = await arrived();
    const v = (await er(`/clinician/visits/${two.routingId}`)).body;
    expect(v.entries.some((e: { thisVisit: boolean; latest: { notes: string } }) => !e.thisVisit && e.latest.notes === "Known asthmatic")).toBe(true);
    expect(v.history.some((h: { id: string }) => h.id === one.caseId)).toBe(true);
  });
});

describe("beds, discharge and transfer (FR 7.8, 7.9, 7.10)", () => {
  it("frees the bed at discharge, and completes a visit without a bed", async () => {
    const { routingId } = await arrived();
    const before = await usedBeds();
    await er(`/clinician/visits/${routingId}/finish`, {});
    expect(await usedBeds()).toBe(before - 1);
    const r = await db.query(`select status from "Routing" where id = $1`, [routingId]);
    expect(r.rows[0].status).toBe("DISCHARGED");

    const other = await urgentCase();
    await db.query(`update "BedReservation" set status = 'RELEASED' where "routingId" = $1`, [other.routingId]);
    await er(`/clinician/incoming/${other.routingId}/arrive`, {});
    expect((await er(`/clinician/visits/${other.routingId}/finish`, {})).body.status).toBe("COMPLETED");
  });

  it("assigns a free bed, and refuses with a transfer when none is free", async () => {
    const { routingId } = await urgentCase();
    await db.query(`update "BedReservation" set status = 'RELEASED' where "routingId" = $1`, [routingId]);
    await er(`/clinician/incoming/${routingId}/arrive`, {});
    expect((await er(`/clinician/visits/${routingId}/transfer`)).status).toBe(409); // a bed is free here
    expect((await er(`/clinician/visits/${routingId}/bed`, {})).status).toBe(200);
    expect((await er(`/clinician/visits/${routingId}`)).body.bed).toBe("USED");
    expect((await er(`/clinician/visits/${routingId}/bed`, {})).status).toBe(409);
  });

  it("transfers to the nearest facility with a free bed, with a held bed and a clinician who is told", async () => {
    const { caseId, routingId } = await urgentCase();
    await db.query(`update "BedReservation" set status = 'RELEASED' where "routingId" = $1`, [routingId]);
    await er(`/clinician/incoming/${routingId}/arrive`, {});
    await db.query(`update "Facility" set "totalBeds" = $1 where name like 'Kacyiru%'`, [await usedBeds()]);

    const noBed = await er(`/clinician/visits/${routingId}/bed`, {});
    expect(noBed.status).toBe(409);
    expect(noBed.body.code).toBe("NO_BED");

    const preview = (await er(`/clinician/visits/${routingId}/transfer`)).body;
    expect(preview.facility.name).toBe("Kibagabaga Level Two Teaching Hospital");
    expect(preview.clinician.name).toBe("Dr. Aimable Ndayisaba");

    const t = (await er(`/clinician/visits/${routingId}/transfer`, {})).body;
    const old = await db.query(`select status from "Routing" where id = $1`, [routingId]);
    expect(old.rows[0].status).toBe("TRANSFERRED");
    const next = await db.query(
      `select r.status, r."clinicianId", b.status as bed from "Routing" r left join "BedReservation" b on b."routingId" = r.id where r.id = $1`,
      [t.routingId],
    );
    expect(next.rows[0]).toEqual({ status: "CONFIRMED", clinicianId: ids["kib.er"], bed: "HELD" });
    expect((await kibEr("/clinician/patients")).body.incoming.find((x: { id: string }) => x.id === t.routingId)).toMatchObject({ isNew: true, transferredFrom: expect.stringContaining("Kacyiru") });
    expect((await er(`/clinician/visits/${routingId}`)).status).toBe(403);
    const audit = await db.query(`select 1 from "AuditEvent" where action = 'patient.transferred' and detail->>'caseId' = $1`, [caseId]);
    expect(audit.rowCount).toBe(1);
  });
});

describe("handover (FR 7.11)", () => {
  it("makes a colleague the attending clinician, tells them, and ends the first clinician's access", async () => {
    const { routingId } = await arrived();
    const colleagues = (await er(`/clinician/visits/${routingId}/colleagues`)).body;
    expect(colleagues.map((c: { id: string }) => c.id)).not.toContain(ids.clinician);
    expect((await er(`/clinician/visits/${routingId}/handover`, { clinicianId: ids["kib.er"] })).status).toBe(400); // another facility

    expect((await er(`/clinician/visits/${routingId}/handover`, { clinicianId: ids.gp })).status).toBe(200);
    expect((await er(`/clinician/visits/${routingId}`)).status).toBe(403);
    expect((await gp(`/clinician/visits/${routingId}`)).status).toBe(200);
    const notice = await db.query(`select kind from "Notification" where "staffId" = $1 and "routingId" = $2`, [ids.gp, routingId]);
    expect(notice.rows).toEqual([{ kind: "HANDOVER" }]);
    const audit = await db.query(`select 1 from "AuditEvent" where action = 'patient.handed_over' and detail->>'routingId' = $1`, [routingId]);
    expect(audit.rowCount).toBe(1);
  });
});
