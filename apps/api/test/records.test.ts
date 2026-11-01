import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const PEOPLE = {
  aline: { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" },
  habimana: { nationalId: "1198580067412163", dateOfBirth: "1985-07-01", name: "Habimana" },
  ange: { nationalId: "1200970031504128", dateOfBirth: "2009-05-21", name: "Ange" },
};
type Browser = ReturnType<typeof browser>;
const MEDS = {
  items: [
    {
      medicine: "Amoxicillin 500 mg capsules",
      dose: "1 capsule",
      frequency: "3 times a day",
      days: 5,
      instructions: "After meals",
    },
  ],
};

let gemini: ReturnType<typeof startFakeGemini>;
let agent: Browser;
let agent2: Browser;
let clinician: Browser;
let manager: Browser;
let admin: Browser;
let ids: Record<string, string>;

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  const { date, shift } = currentShift();
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role in ('CLINICIAN', 'AGENT') on conflict do nothing`,
    [date, shift],
  );
  ids = Object.fromEntries(
    (await db.query(`select id, email from "Staff"`)).rows.map((member) => [member.email.split("@")[0], member.id]),
  );
  [agent, agent2, clinician, manager, admin] = await Promise.all(
    ["agent", "agent2", "clinician", "manager", "admin"].map((name) => staffLogin(`${name}@ubuzima.test`)),
  );
});
afterAll(async () => {
  await gemini.close();
  await db.end();
});

async function logInAs(who: keyof typeof PEOPLE) {
  const patient = browser();
  await patient("/auth/patient/login", PEOPLE[who]);
  return { patient, me: (await patient("/auth/me")).body };
}

/** A case handled by `agent`: created by the patient, then given to the agent directly. */
async function handledCase(subject?: string) {
  await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
  const { patient, me } = await logInAs("aline");
  const id = (await patient("/cases", { subjectId: subject ?? me.id, location: KIGALI })).body.id as string;
  await db.query(
    `update "Case" set status = 'ASSIGNED', "agentId" = $2, "triageLevel" = 'MINOR', "assignedAt" = now() where id = $1`,
    [id, ids.agent],
  );
  // The agent counts as connected, or the dispatcher would rightly give the case back (FR 6.14).
  await db.query(`update "Staff" set "agentStatus" = 'BUSY', "lastSeenAt" = now() + interval '1 hour' where id = $1`, [
    ids.agent,
  ]);
  return { patient, me, id };
}

describe("issuing prescriptions (FR 11.1, 11.2, 11.6)", () => {
  it("lets the agent handling the case prescribe, with a code, a 7-day validity and their licence", async () => {
    const { patient, me, id } = await handledCase();
    expect((await agent2(`/agent/cases/${id}/prescriptions`, MEDS)).status).toBe(403);
    expect((await agent(`/agent/cases/${id}/prescriptions`, { items: [] })).status).toBe(400);
    expect((await agent(`/agent/cases/${id}/prescriptions`, { items: [{ ...MEDS.items[0], days: 0 }] })).status).toBe(
      400,
    );

    const prescription = (await agent(`/agent/cases/${id}/prescriptions`, MEDS)).body;
    expect(prescription.code).toMatch(/^RX-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(prescription.status).toBe("VALID");
    expect(new Date(prescription.validUntil).getTime() - new Date(prescription.issuedAt).getTime()).toBe(
      7 * 86_400_000,
    );
    expect(prescription.prescriber).toMatchObject({ name: "Diane Umutoni", licence: "RNMC-22817" });

    // The patient is told the code in the chat, and the agent sees the history (FR 11.6).
    const view = (await patient(`/cases/${id}`)).body;
    expect(view.messages.at(-1).text).toContain(prescription.code);
    expect((await agent(`/agent/cases/${id}`)).body.prescriptions.map((listed: { id: string }) => listed.id)).toContain(
      prescription.id,
    );
    expect(me.id).toBeTruthy();
  });

  it("only closes as Prescription issued when one was issued in the case", async () => {
    const { id } = await handledCase();
    expect(
      (await agent(`/agent/cases/${id}/close`, { outcome: "PRESCRIPTION_ISSUED", note: "Advised and prescribed" }))
        .status,
    ).toBe(409);
    await agent(`/agent/cases/${id}/prescriptions`, MEDS);
    expect(
      (await agent(`/agent/cases/${id}/close`, { outcome: "PRESCRIPTION_ISSUED", note: "Advised and prescribed" }))
        .status,
    ).toBe(200);
  });

  it("lets the attending clinician prescribe during the visit, and no one else", async () => {
    await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
    const { patient, me } = await logInAs("aline");
    const caseId = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    let view = (await patient(`/cases/${caseId}`)).body;
    if (view.stage === "PREGNANCY") view = (await patient(`/cases/${caseId}/pregnancy`, { pregnant: false })).body;
    view = (await patient(`/cases/${caseId}/answers`, { questionId: view.question.id, answer: false })).body;
    await patient(`/cases/${caseId}/answers`, { questionId: view.question.id, answer: true });
    const routingId = (await db.query(`select id from "Routing" where "caseId" = $1`, [caseId])).rows[0].id;
    await clinician(`/clinician/incoming/${routingId}/arrive`, {});
    const prescription = (await clinician(`/clinician/visits/${routingId}/prescriptions`, MEDS)).body;
    expect(prescription.prescriber.name).toBe("Dr. Samuel Mugisha");
    expect((await agent(`/clinician/visits/${routingId}/prescriptions`, MEDS)).status).toBe(403);
    expect((await clinician(`/clinician/visits/${routingId}`)).body.prescriptions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("after issuing (FR 11.3, 11.4, 11.5)", () => {
  it("lists what each person issued, and only the issuer can cancel", async () => {
    const { id } = await handledCase();
    const prescription = (await agent(`/agent/cases/${id}/prescriptions`, MEDS)).body;
    const mine = (await agent("/prescriptions/mine")).body;
    expect(mine.find((listed: { id: string }) => listed.id === prescription.id)).toMatchObject({
      patient: "Aline Uwase",
      status: "VALID",
    });
    expect(
      (await agent2("/prescriptions/mine")).body.find((listed: { id: string }) => listed.id === prescription.id),
    ).toBeUndefined();

    expect((await agent2(`/prescriptions/${prescription.id}/cancel`, { reason: "Wrong patient" })).status).toBe(403);
    expect((await agent(`/prescriptions/${prescription.id}/cancel`, { reason: "x" })).status).toBe(400);
    expect((await agent(`/prescriptions/${prescription.id}/cancel`, { reason: "Wrong dose written" })).status).toBe(
      200,
    );
    expect((await agent(`/prescriptions/${prescription.id}/cancel`, { reason: "Again" })).status).toBe(409);
    expect(
      (await agent("/prescriptions/mine")).body.find((listed: { id: string }) => listed.id === prescription.id).status,
    ).toBe("CANCELLED");
  });

  it("keeps an expired prescription in the record, marked Expired", async () => {
    const { patient, me, id } = await handledCase();
    const prescription = (await agent(`/agent/cases/${id}/prescriptions`, MEDS)).body;
    await db.query(`update "Prescription" set "validUntil" = now() - interval '1 day' where id = $1`, [
      prescription.id,
    ]);
    const records = (await patient(`/records/${me.id}`)).body;
    expect(records.prescriptions.find((listed: { id: string }) => listed.id === prescription.id).status).toBe(
      "EXPIRED",
    );
  });
});

describe("the public check page (FR 11.7)", () => {
  it("shows a pharmacy what it needs, and nothing else, and logs every check", async () => {
    const { id } = await handledCase();
    const prescription = (await agent(`/agent/cases/${id}/prescriptions`, MEDS)).body;
    const response = await fetch(`${API}/public/prescriptions/${prescription.code.toLowerCase().replace(/-/g, "")}`);
    const body = await response.json();
    expect(body).toMatchObject({
      found: true,
      code: prescription.code,
      status: "VALID",
      patient: "Aline Uwase",
      prescriber: { name: "Diane Umutoni", licence: "RNMC-22817" },
    });
    expect(body.items[0]).toMatchObject({ medicine: "Amoxicillin 500 mg capsules", dose: "1 capsule", days: 5 });
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/1199|nationalId|diagnosis|dateOfBirth/);
    expect(Object.keys(body.prescriber)).toEqual(["name", "licence"]);

    expect(await (await fetch(`${API}/public/prescriptions/RX-0000-0000`)).json()).toEqual({ found: false });
    const logged = await db.query(`select count(*)::int as n from "AuditEvent" where action = 'prescription.checked'`);
    expect(logged.rows[0].n).toBeGreaterThanOrEqual(2);
  });
});

describe("patient records and activity (FR 7.2, 10.2, 1.3)", () => {
  it("shows a parent their own and their children's records, and nobody else's", async () => {
    const { patient, me } = await logInAs("aline");
    const kids = me.family.map((member: { id: string }) => member.id);
    expect((await patient(`/records/${me.id}`)).status).toBe(200);
    expect((await patient(`/records/${kids[0]}`)).body.person.name).toBeTruthy();
    const father = await logInAs("habimana");
    const ange = await logInAs("ange");
    // A parent sees a 17-year-old's records; she sees only her own (FR 1.3).
    expect((await father.patient(`/records/${ange.me.id}`)).status).toBe(200);
    expect((await ange.patient(`/records/${father.me.id}`)).status).toBe(403);
    expect((await ange.patient(`/records/${me.id}`)).status).toBe(403);
  });

  it("lists every action on the record with who, what and the device for logins", async () => {
    const { patient, me, id } = await handledCase();
    const prescription = (await agent(`/agent/cases/${id}/prescriptions`, MEDS)).body;
    await fetch(`${API}/public/prescriptions/${prescription.code}`);
    const rows = (await patient(`/records/${me.id}/activity`)).body.rows as {
      action: string;
      who: { name: string; role: string | null };
      device: string | null;
      what: string;
    }[];
    expect(rows.find((row) => row.action === "patient.login")).toMatchObject({
      who: { name: "You" },
      device: expect.any(String),
    });
    expect(rows.find((row) => row.action === "prescription.issued")).toMatchObject({
      who: { name: "Diane Umutoni", role: "Health agent" },
      what: `Issued a prescription: ${prescription.code}`,
    });
    expect(rows.find((row) => row.action === "prescription.checked")).toMatchObject({
      who: { name: "A pharmacy" },
      what: `Checked at a pharmacy: ${prescription.code}`,
    });
    // Opening the same record again soon after is one visit, not two (FR 10.1).
    await patient(`/records/${me.id}`);
    await patient(`/records/${me.id}`);
    const views = (await patient(`/records/${me.id}/activity`)).body.rows.filter(
      (row: { action: string }) => row.action === "records.viewed",
    );
    expect(views).toHaveLength(1);
  });
});

describe("staff activity and the on-duty dashboard (FR 10.3, 12.5)", () => {
  it("shows a manager only their facility's staff, and the administrator everyone", async () => {
    const managerView = (await manager("/activity")).body;
    const names = managerView.people.map((person: { name: string }) => person.name);
    expect(names).toContain("Dr. Samuel Mugisha");
    expect(names).not.toContain("Diane Umutoni"); // agents have no facility
    expect(managerView.rows.every((row: { who: { role: string } }) => row.who.role !== "Health agent")).toBe(true);
    const adminView = (await admin(`/activity?staffId=${ids.agent}`)).body;
    expect(adminView.rows.length).toBeGreaterThan(0);
    expect(adminView.rows.every((row: { who: { name: string } }) => row.who.name === "Diane Umutoni")).toBe(true);
    expect((await agent("/activity")).status).toBe(403);
  });

  it("flags agents who are scheduled now but Offline", async () => {
    await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
    await db.query(`update "Staff" set "agentStatus" = 'AWAY' where role = 'AGENT'`);
    await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
    await agent2("/agent/status", { status: "OFFLINE" }, "PUT");
    const onDuty = (await admin("/on-duty")).body;
    expect(onDuty.rows.find((row: { id: string }) => row.id === ids.agent2)).toMatchObject({
      scheduled: true,
      status: "OFFLINE",
      alert: true,
    });
    expect(onDuty.rows.find((row: { id: string }) => row.id === ids.agent)).toMatchObject({
      scheduled: true,
      status: "AVAILABLE",
      alert: false,
    });
    expect(onDuty.rows[0].alert).toBe(true);
    expect((await manager("/on-duty")).status).toBe(403);
  });
});

// Last in the file: it leaves 127.0.0.1 paused for 10 minutes, and log rows can't be deleted (NFR 9).
describe("guessing codes (FR 11.7)", () => {
  it("pauses an address that tries many unknown codes", async () => {
    for (let attempt = 0; attempt < 20; attempt++)
      await fetch(`${API}/public/prescriptions/RX-ZZZZ-${String(attempt).padStart(4, "0")}`);
    expect((await fetch(`${API}/public/prescriptions/RX-ZZZZ-9999`)).status).toBe(429);
  });
});
