import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" };
const ERIC = { nationalId: "1200180054377109", dateOfBirth: "2001-09-30", name: "Eric" };
const CLAUDINE = { nationalId: "1199670078215135", dateOfBirth: "1996-04-18", name: "Claudine" };
const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const LONG = "I have had a dry cough and a mild fever since yesterday evening";

let gemini: ReturnType<typeof startFakeGemini>;

beforeAll(async () => {
  await resetDatabase();
  gemini = startFakeGemini();
  // Put every clinician on the current shift, so routing results don't depend on the time the tests run.
  const { date, shift } = currentShift();
  await db.query(
    `insert into "ShiftAssignment" (id, "staffId", date, shift, "createdById")
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role = 'CLINICIAN'
     on conflict do nothing`,
    [date, shift],
  );
});
afterAll(async () => {
  await gemini.close();
  await db.end();
});

async function logInAs(who: typeof ALINE) {
  const patient = browser();
  await patient("/auth/patient/login", who);
  const me = (await patient("/auth/me")).body;
  return { patient, me };
}

/** Answers "not pregnant" when asked, then No to every red flag. Returns the final view. */
async function answerAllNo(patient: ReturnType<typeof browser>, id: string) {
  let view = (await patient(`/cases/${id}`)).body;
  if (view.stage === "PREGNANCY") view = (await patient(`/cases/${id}/pregnancy`, { pregnant: false })).body;
  const asked: string[] = [];
  while (view.stage === "RED_FLAGS") {
    asked.push(view.question.code);
    view = (await patient(`/cases/${id}/answers`, { questionId: view.question.id, answer: false })).body;
  }
  return { view, asked };
}

describe("starting a case (FR 3.1 to 3.5)", () => {
  it("lists the parent and children, and opens the existing case instead of a second one (FR 3.1, 3.2)", async () => {
    const { patient, me } = await logInAs(ALINE);
    const mine = (await patient("/cases/mine")).body;
    expect(mine.people.map((person: { firstName: string }) => person.firstName)).toEqual(["Aline", "Kevin", "Grace"]);
    const first = await patient("/cases", { subjectId: me.id, location: KIGALI });
    expect(first.body).toMatchObject({ existing: false });
    expect(first.body.nearby).toHaveLength(5);
    const again = await patient("/cases", { subjectId: me.id, location: KIGALI });
    expect(again.body).toEqual({ id: first.body.id, existing: true });
    await patient(`/cases/${first.body.id}/cancel`, {});
  });

  it("uses the centre of the chosen sector when GPS isn't available (FR 3.4)", async () => {
    const { patient, me } = await logInAs(ALINE);
    const started = await patient("/cases", { subjectId: me.id, location: { source: "MANUAL", sectorCode: "RW1101" } });
    const row = (
      await db.query(`select latitude, longitude, "locationSource", "sectorCode" from "Case" where id = $1`, [
        started.body.id,
      ])
    ).rows[0];
    expect(row).toMatchObject({
      latitude: -1.95342,
      longitude: 30.05507,
      locationSource: "MANUAL",
      sectorCode: "RW1101",
    });
    await patient(`/cases/${started.body.id}/cancel`, {});
  });

  it("refuses a case for someone who isn't the patient or their child", async () => {
    const { patient } = await logInAs(ALINE);
    const { me: eric } = await logInAs(ERIC);
    expect((await patient("/cases", { subjectId: eric.id, location: KIGALI })).status).toBe(403);
  });
});

describe("red flags (FR 3.6, 4.1, 4.2, Appendix C)", () => {
  it("asks a woman 12-55 about pregnancy first, then group A only when she isn't pregnant", async () => {
    const { patient, me } = await logInAs(ALINE);
    const { id } = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body;
    expect((await patient(`/cases/${id}`)).body.stage).toBe("PREGNANCY");
    const { view, asked } = await answerAllNo(patient, id);
    expect(asked).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A13"]);
    expect(view.stage).toBe("SYMPTOMS");
    await patient(`/cases/${id}/cancel`, {});
  });

  it("adds group C for a child under 12, and P when pregnant", async () => {
    const { patient, me } = await logInAs(ALINE);
    const kevin = (await patient("/cases/mine")).body.people.find(
      (person: { firstName: string }) => person.firstName === "Kevin",
    );
    const child = (await patient("/cases", { subjectId: kevin.id, location: KIGALI })).body.id;
    expect((await answerAllNo(patient, child)).asked).toHaveLength(18);
    await patient(`/cases/${child}/cancel`, {});

    const ownCase = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    await patient(`/cases/${ownCase}/pregnancy`, { pregnant: true });
    let view = (await patient(`/cases/${ownCase}`)).body;
    expect(view.question.total).toBe(17); // A1-A13 and P1-P4
    await patient(`/cases/${ownCase}/cancel`, {});
  });

  it("adds group N for a baby under 2 months", async () => {
    const { patient } = await logInAs(CLAUDINE);
    const baby = (await patient("/cases/mine")).body.people.find(
      (person: { firstName: string }) => person.firstName === "Bruno",
    );
    const id = (await patient("/cases", { subjectId: baby.id, location: KIGALI })).body.id;
    expect((await answerAllNo(patient, id)).asked).toContain("N1");
    await patient(`/cases/${id}/cancel`, {});
  });

  it("stops at the first Yes: Urgent, the question's service, bed needed, queued, and shows the nearest facility (FR 4.1, 5.2, 5.5)", async () => {
    const { patient, me } = await logInAs(ALINE);
    const id = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    await patient(`/cases/${id}/pregnancy`, { pregnant: false });
    let view = (await patient(`/cases/${id}`)).body;
    view = (await patient(`/cases/${id}/answers`, { questionId: view.question.id, answer: false })).body; // A1 No
    view = (await patient(`/cases/${id}/answers`, { questionId: view.question.id, answer: true })).body; // A2 Yes
    expect(view).toMatchObject({ stage: "WAITING", urgent: true, redFlagsAnswered: 2 });
    expect(view.guidance.facility.name).toBeTruthy();
    const row = (
      await db.query(`select "triageLevel", "neededService", "bedNeeded", status from "Case" where id = $1`, [id])
    ).rows[0];
    expect(row).toEqual({ triageLevel: "URGENT", neededService: "EMERGENCY_CARE", bedNeeded: true, status: "QUEUED" });
    expect(gemini.calls.length).toBe(0); // red flags never use the AI
  });

  it("one-screen checklist: the sign tapped is a Yes, Urgent with that sign's service (FR 3.6, 4.1)", async () => {
    const { patient } = await logInAs(ALINE);
    const kevin = (await patient("/cases/mine")).body.people.find(
      (person: { firstName: string }) => person.firstName === "Kevin",
    );
    const id = (await patient("/cases", { subjectId: kevin.id, location: KIGALI })).body.id;
    let view = (await patient(`/cases/${id}`)).body;
    const signs = [view.question, ...view.question.after];
    expect(signs.map((sign: { code: string }) => sign.code[0])).toEqual(expect.arrayContaining(["A", "C"])); // a child of 7 gets groups A and C
    view = (
      await patient(`/cases/${id}/checklist`, { yes: signs.find((sign: { code: string }) => sign.code === "A4").id })
    ).body;
    expect(view).toMatchObject({ stage: "WAITING", urgent: true, redFlagsAnswered: 1 });
    const row = (await db.query(`select "triageLevel", "neededService" from "Case" where id = $1`, [id])).rows[0];
    expect(row).toEqual({ triageLevel: "URGENT", neededService: "SURGERY" });
    expect((await patient(`/cases/${id}/checklist`, { yes: null })).status).toBe(409); // answered once only
    await patient(`/cases/${id}/cancel`, {});
  });

  it('one-screen checklist: "None of these" saves a No for every sign shown and moves to the description (FR 3.6, 3.7)', async () => {
    const { patient } = await logInAs(ALINE);
    const kevin = (await patient("/cases/mine")).body.people.find(
      (person: { firstName: string }) => person.firstName === "Kevin",
    );
    const id = (await patient("/cases", { subjectId: kevin.id, location: KIGALI })).body.id;
    const shown = (await patient(`/cases/${id}`)).body.question.total;
    const view = (await patient(`/cases/${id}/checklist`, { yes: null })).body;
    expect(view).toMatchObject({ stage: "SYMPTOMS", urgent: false, redFlagsAnswered: shown });
    const answeredNo = (
      await db.query(`select count(*)::int as n from "RedFlagAnswer" where "caseId" = $1 and answer = false`, [id])
    ).rows[0].n;
    expect(answeredNo).toBe(shown);
    await patient(`/cases/${id}/cancel`, {});
  });

  it("makes a baby under 8 days Urgent at once, with no questions (FR 4.2)", async () => {
    const { patient } = await logInAs(ERIC);
    const baby = (await patient("/cases/mine")).body.people.find(
      (person: { firstName: string }) => person.firstName === "Keza",
    );
    const id = (await patient("/cases", { subjectId: baby.id, location: KIGALI })).body.id;
    const view = (await patient(`/cases/${id}`)).body;
    expect(view).toMatchObject({ stage: "WAITING", urgent: true, redFlagsAnswered: 0 });
    const row = (await db.query(`select "neededService", "triageReason" from "Case" where id = $1`, [id])).rows[0];
    expect(row).toEqual({ neededService: "PAEDIATRICS", triageReason: "Baby under 8 days old (rule N2)." });
  });
});

describe("symptoms and AI triage (FR 3.7, 4.3 to 4.8)", () => {
  async function submit(description: string) {
    const { patient } = await logInAs(CLAUDINE);
    const me = (await patient("/auth/me")).body;
    const open = (await patient("/cases/mine")).body.open.find(
      (openCase: { patientId: string }) => openCase.patientId === me.id,
    );
    if (open) await patient(`/cases/${open.id}/cancel`, {});
    const id = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    await answerAllNo(patient, id);
    const view = (await patient(`/cases/${id}/symptoms`, { description, duration: "ONE_TO_THREE_DAYS", severity: 4 }))
      .body;
    const row = (
      await db.query(`select "triageLevel", "triageReason", "neededService", status from "Case" where id = $1`, [id])
    ).rows[0];
    return { view, row, id };
  }

  it("is Minor with a minor, high-confidence AI suggestion, and queued for an agent anyway (FR 4.4, 4.9)", async () => {
    const { row, view } = await submit(LONG);
    expect(row).toMatchObject({ triageLevel: "MINOR", status: "QUEUED", neededService: "GENERAL_MEDICINE" });
    expect(view.urgent).toBe(false);
  });

  it("never sends the name, national ID or location to the AI (FR 4.6)", () => {
    const sent = gemini.calls.join(" ");
    expect(sent).not.toContain("Claudine");
    expect(sent).not.toContain("1199670078215135");
    expect(sent).not.toContain("-1.95");
    expect(sent).not.toContain("30.09");
  });

  it("is Uncertain for low confidence or a description under 5 words (FR 4.5)", async () => {
    expect((await submit(`${LONG} lowword`)).row.triageLevel).toBe("UNCERTAIN");
    expect((await submit("cough")).row.triageLevel).toBe("UNCERTAIN");
  });

  it("is Urgent when the AI says urgent, and shows the nearest facility (FR 4.4, 5.5)", async () => {
    const { row, view } = await submit(`${LONG} urgentword`);
    expect(row.triageLevel).toBe("URGENT");
    expect(view.guidance.facility).not.toBeNull();
  });

  it("is Uncertain, not an error, when the AI fails, and stops calling it after 3 failures (FR 4.7)", async () => {
    const before = gemini.calls.length;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await submit(`${LONG} brokenword ${attempt}`);
      expect(result.row.triageLevel).toBe("UNCERTAIN");
      expect(result.row.triageReason).toContain("AI unavailable");
    }
    const callsAfterThree = gemini.calls.length;
    expect(callsAfterThree).toBeGreaterThan(before);
    await submit(LONG); // breaker open: the AI is skipped
    expect(gemini.calls.length).toBe(callsAfterThree);
    const failures = await db.query(`select count(*)::int as n from "AuditEvent" where action = 'ai.failure'`);
    expect(failures.rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it("skips the AI while the administrator has switched it off (FR 4.8)", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    await admin("/settings", { aiEnabled: false }, "PUT");
    const result = await submit(LONG);
    await admin("/settings", { aiEnabled: true }, "PUT");
    expect(result.row).toMatchObject({ triageLevel: "UNCERTAIN" });
    expect(result.row.triageReason).toContain("switched off");
  });
});

describe("prefer a call, cancel, access (FR 3.8, 3.9, 3.11, 9.1)", () => {
  it("creates a 'Call requested' case from the home screen, Uncertain, with a valid Rwandan number", async () => {
    const { patient, me } = await logInAs(ERIC);
    expect(
      (await patient("/cases/call", { subjectId: me.id, number: "12345", owner: "MINE" })).body.fields,
    ).toHaveProperty("number");
    const started = await patient("/cases/call", { subjectId: me.id, number: "0788 123 456", owner: "FAMILY_MEMBER" });
    const row = (
      await db.query(
        `select "callRequested", "callNumber", "callNumberOwner", "triageLevel", status from "Case" where id = $1`,
        [started.body.id],
      )
    ).rows[0];
    expect(row).toEqual({
      callRequested: true,
      callNumber: "0788123456",
      callNumberOwner: "FAMILY_MEMBER",
      triageLevel: "UNCERTAIN",
      status: "QUEUED",
    });
  });

  it("lets the patient cancel, closing the case as 'Cancelled by patient'", async () => {
    const { patient, me } = await logInAs(ERIC);
    const open = (await patient("/cases/mine")).body.open.find(
      (openCase: { patientId: string }) => openCase.patientId === me.id,
    );
    const view = (await patient(`/cases/${open.id}/cancel`, {})).body;
    expect(view).toMatchObject({ status: "CLOSED", outcome: "CANCELLED_BY_PATIENT" });
  });

  it("hides a case from anyone outside the family", async () => {
    const { patient: aline } = await logInAs(ALINE);
    const someone = (
      await db.query(
        `select c.id from "Case" c join "Patient" p on p.id = c."patientId" where p."firstName" = 'Claudine' limit 1`,
      )
    ).rows[0];
    expect((await aline(`/cases/${someone.id}`)).status).toBe(404);
    expect((await browser()(`/cases/${someone.id}`)).status).toBe(401);
  });
});

describe("emergency screen (FR 1.9)", () => {
  it("shows the nearest facility with emergency care on duty, without login, and creates nothing", async () => {
    const before = (await db.query(`select count(*)::int as n from "Case"`)).rows[0].n;
    const emergency = await fetch(`${API}/public/emergency?lat=-1.95&lng=30.09`).then((response) => response.json());
    expect(emergency.facility.name).toBeTruthy();
    expect(emergency.facility.distance).toMatch(/km|m$/);
    expect((await fetch(`${API}/public/emergency`).then((response) => response.json())).facility).toBeNull();
    expect((await db.query(`select count(*)::int as n from "Case"`)).rows[0].n).toBe(before);
  });
});

describe("answering without a connection (FR 3.10)", () => {
  it("sends the questions still to come, in the order the server will ask them", async () => {
    await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`); // one open case per person
    const { patient, me } = await logInAs(ALINE);
    const id = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    let view = (await patient(`/cases/${id}`)).body;
    if (view.stage === "PREGNANCY") view = (await patient(`/cases/${id}/pregnancy`, { pregnant: false })).body;
    const planned = [view.question.id, ...view.question.after.map((question: { id: string }) => question.id)];
    expect(planned).toHaveLength(view.question.total - view.question.index + 1);
    // The device answers them one after another later, without asking the server for the next one.
    for (const questionId of planned) {
      expect((await patient(`/cases/${id}/answers`, { questionId, answer: false })).status).toBe(200);
    }
    expect((await patient(`/cases/${id}`)).body.stage).toBe("SYMPTOMS");
    await patient(`/cases/${id}/cancel`, {});
  });
});

describe("Kinyarwanda (NFR 7)", () => {
  it("asks the red-flag questions in the language the patient chose", async () => {
    await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
    const { patient, me } = await logInAs(ALINE);
    expect((await patient("/me/lang", { lang: "rw" }, "PUT")).status).toBe(204);
    const id = (await patient("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    let view = (await patient(`/cases/${id}`)).body;
    if (view.stage === "PREGNANCY") view = (await patient(`/cases/${id}/pregnancy`, { pregnant: false })).body;
    expect(view.question.code).toBe("A1");
    expect(view.question.text).toMatch(/^Umurwayi /);
    expect(view.question.after[0].text).toMatch(/^Umurwayi /);
    // Agents and the record keep the English question.
    await patient(`/cases/${id}/answers`, { questionId: view.question.id, answer: false });
    const saved = await db.query(`select "textEn" from "RedFlagAnswer" where "caseId" = $1`, [id]);
    expect(saved.rows[0].textEn).toMatch(/^Is the sick person/);
    await patient("/me/lang", { lang: "en" }, "PUT");
    expect((await patient(`/cases/${id}`)).body.question.text).toMatch(/^Is the sick person/);
    expect((await patient("/me/lang", { lang: "fr" }, "PUT")).status).toBe(400);
    await patient(`/cases/${id}/cancel`, {});
  });
});
