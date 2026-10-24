import { currentShift } from "@ubuzima/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

/**
 * Phase 2: the whole journey in one story, through the same endpoints the screens use.
 * Patient → AI triage → agent (queue, chat, review, routing with a bed and a clinician) → facility (arrival, record, prescription,
 * discharge) → pharmacy check → the patient's records and activity. Only the AI is a stand-in.
 */
const ESPERANCE = { nationalId: "1 1960 7 0012689 2 41", dateOfBirth: "1960-12-25", name: "Mukamana" };
const NYARUGENGE = { source: "GPS", latitude: -1.9441, longitude: 30.0619 };

let gemini: ReturnType<typeof startFakeGemini>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 6000): Promise<T> {
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
     select gen_random_uuid(), s.id, $1::date, $2::"ShiftType", s.id from "Staff" s where s.role in ('CLINICIAN', 'AGENT') on conflict do nothing`,
    [date, shift],
  );
});
afterAll(async () => {
  await gemini.close();
  await db.end();
});

describe("the full flow (phase 2)", () => {
  it("takes one patient from asking for help to a dispensed prescription, with every step on the record", async () => {
    // 1. The patient logs in with the national ID and asks for help (FR 1, 3).
    const patient = browser();
    expect((await patient("/auth/patient/login", ESPERANCE)).status).toBe(200);
    const me = (await patient("/auth/me")).body;
    const caseId = (await patient("/cases", { subjectId: me.id, location: NYARUGENGE })).body.id as string;
    let v = (await patient(`/cases/${caseId}`)).body;
    while (v.stage === "RED_FLAGS") v = (await patient(`/cases/${caseId}/answers`, { questionId: v.question.id, answer: false })).body;

    // 2. The AI sorts it (Minor, or Uncertain if the AI is unavailable); either way it waits for an agent (FR 4).
    v = (await patient(`/cases/${caseId}/symptoms`, { description: "Cough for two weeks, now short of breath when walking and a fever at night", duration: "MORE_THAN_A_WEEK", severity: 7 })).body;
    expect(v.stage).toBe("WAITING");

    // 3. An agent takes it from the queue, chats, judges it Urgent with a bed, and routes her (FR 6, 5.3 to 5.12).
    const agent = await staffLogin("agent@ubuzima.test");
    await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
    const offer = await until(async () => (await agent("/agent/state")).body.offer);
    expect(offer.id).toBe(caseId);
    expect((await agent(`/agent/offers/${caseId}/accept`, {})).status).toBe(200);
    await agent(`/agent/cases/${caseId}/messages`, { text: "Muraho Esperance, I'm Diane. Are you coughing up any blood?" });
    await patient(`/cases/${caseId}/messages`, { text: "No" });
    const view = (await agent(`/agent/cases/${caseId}`)).body;
    expect(view.messages.map((m: { text: string }) => m.text)).toContain("No");
    await agent(`/agent/cases/${caseId}/triage`, { triageLevel: "URGENT", category: "RESPIRATORY", neededService: "INTERNAL_MEDICINE", bedNeeded: true }, "PUT");
    const options = (await agent(`/agent/cases/${caseId}/routing-options?service=INTERNAL_MEDICINE&bedNeeded=true`)).body;
    expect(options.kind).toBe("SUITABLE");
    expect((await agent(`/agent/cases/${caseId}/routing`, { facilityId: options.nearestId, bedNeeded: true })).status).toBe(201);
    const suggested = (await db.query(`select r.id, r."clinicianId", b.status as bed from "Routing" r left join "BedReservation" b on b."routingId" = r.id where r."caseId" = $1 and r.status = 'CONFIRMED'`, [caseId])).rows[0];
    expect(suggested).toMatchObject({ clinicianId: expect.any(String), bed: "HELD" });
    expect((await patient(`/cases/${caseId}`)).body.guidance).toMatchObject({ confirmed: true });
    expect((await agent(`/agent/cases/${caseId}/close`, { outcome: "ROUTED_TO_FACILITY", note: "Two weeks of cough, now breathless. Sent for assessment." })).status).toBe(200);
    expect((await agent(`/agent/cases/${caseId}`)).status).toBe(403); // the agent's access ends (FR 6.15)

    // 4. At the facility: the attending clinician sees her coming, checks the photo, and marks her arrived (FR 7.4, 7.5).
    const email = (await db.query(`select email from "Staff" where id = $1`, [suggested.clinicianId])).rows[0].email;
    const clinician = await staffLogin(email);
    const incoming = (await clinician("/clinician/patients")).body.incoming;
    expect(incoming.map((x: { id: string }) => x.id)).toContain(suggested.id);
    expect((await clinician(`/clinician/incoming/${suggested.id}/arrive`, {})).body).toEqual({ attending: true });

    // 5. The visit: a record entry, a prescription, then discharge, which frees the bed (FR 7.7, 11.1, 7.10).
    await clinician(`/clinician/visits/${suggested.id}/entries`, { diagnosis: "Community-acquired pneumonia", treatment: "Oral antibiotics, review in 3 days" });
    const rx = (await clinician(`/clinician/visits/${suggested.id}/prescriptions`, {
      items: [{ medicine: "Amoxicillin 500 mg capsules", dose: "1 capsule", frequency: "3 times a day", days: 5, instructions: "Finish the course" }],
    })).body;
    expect(rx.status).toBe("VALID");
    expect((await clinician(`/clinician/visits/${suggested.id}/finish`, {})).body.status).toBe("DISCHARGED");

    // 6. The pharmacy checks the code (FR 11.7).
    const check = await (await fetch(`${API}/public/prescriptions/${rx.code}`)).json();
    expect(check).toMatchObject({ found: true, status: "VALID", patient: "Esperance Mukamana" });

    // 7. The patient sees it all in her records, and rates the help (FR 7.2, 6.15).
    const records = (await patient(`/records/${me.id}`)).body;
    expect(records.prescriptions[0].code).toBe(rx.code);
    expect(records.cases[0].visits[0]).toMatchObject({ status: "DISCHARGED", entries: [expect.objectContaining({ diagnosis: "Community-acquired pneumonia" })] });
    expect((await patient(`/cases/${caseId}`)).body.visit).toMatchObject({ active: false });
    expect((await patient(`/cases/${caseId}/rating`, { rating: 5 })).status).toBe(200);

    // 8. And every step is on her activity list, oldest to newest, with who did it (FR 10.1, 10.2).
    const actions = ((await patient(`/records/${me.id}/activity`)).body.rows as { action: string }[]).map((r) => r.action).reverse();
    const order = ["case.started", "case.submitted", "case.accepted", "triage.confirmed", "bed.reserved", "routing.confirmed", "case.closed", "patient.arrived", "record.entry_added", "prescription.issued", "patient.discharged", "prescription.checked", "case.rated"];
    const positions = order.map((a) => actions.indexOf(a));
    expect(positions.every((p) => p >= 0), `missing: ${order.filter((a, i) => positions[i] < 0).join(", ")}`).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
