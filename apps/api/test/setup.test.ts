import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDatabase } from "./setup";
import { currentShift, weekStart } from "@ubuzima/shared";
import { browser, db, staffLogin } from "./client";

beforeAll(resetDatabase);
afterAll(() => db.end());

const profile = {
  name: "Test Health Centre",
  level: "HEALTH_CENTRE",
  services: ["GENERAL_MEDICINE", "PAEDIATRICS"],
  district: "Gasabo",
  sector: "Kimihurura",
  latitude: -1.95,
  longitude: 30.09,
  phone: "0788 123 456",
  active: true,
};

describe("facilities (FR 8.1, 8.3, 12.1)", () => {
  it("lets only the administrator create facilities, with a location inside Rwanda", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    expect((await admin("/facilities", { ...profile, latitude: 10 })).body.fields).toHaveProperty("latitude");
    expect((await admin("/facilities", profile)).status).toBe(201);
    const manager = await staffLogin("manager@ubuzima.test");
    expect((await manager("/facilities", profile)).status).toBe(403);
  });

  it("gives a facility manager only their own facility, and never patient data (FR 9.4)", async () => {
    const manager = await staffLogin("manager@ubuzima.test");
    const mine = await manager("/facilities/mine");
    expect(mine.body).toMatchObject({ name: "Kacyiru District Hospital", availableBeds: mine.body.totalBeds });
    expect((await manager("/facilities")).status).toBe(403);
    expect((await manager("/staff")).status).toBe(403);
  });

  it("updates the profile and beds, refuses a negative total, and logs both", async () => {
    const manager = await staffLogin("manager@ubuzima.test");
    const mine = (await manager("/facilities/mine")).body;
    const update = { ...profile, name: mine.name, level: mine.level, services: mine.services, district: mine.district, latitude: mine.latitude, longitude: mine.longitude };
    expect((await manager("/facilities/mine", update, "PUT")).status).toBe(200);
    expect((await manager("/facilities/mine/beds", { totalBeds: -1 }, "PUT")).status).toBe(400);
    expect((await manager("/facilities/mine/beds", { totalBeds: 90 }, "PUT")).status).toBe(200);
    expect((await manager("/facilities/mine")).body).toMatchObject({ totalBeds: 90, availableBeds: 90 });
    const n = await db.query(`select action from "AuditEvent" where action in ('facility.profile.updated', 'facility.beds.updated')`);
    expect(n.rows.length).toBe(2);
  });

  it("never routes to an inactive facility: the flag is saved (FR 8.1)", async () => {
    const manager = await staffLogin("manager2@ubuzima.test");
    const mine = (await manager("/facilities/mine")).body;
    const body = { name: mine.name, level: mine.level, services: mine.services, district: mine.district, latitude: mine.latitude, longitude: mine.longitude, active: false };
    expect((await manager("/facilities/mine", body, "PUT")).status).toBe(200);
    expect((await manager("/facilities/mine")).body.active).toBe(false);
  });
});

describe("clinician accounts (FR 8.2)", () => {
  it("lets a manager invite clinicians only to their own facility, with a specialty and licence", async () => {
    const manager = await staffLogin("manager@ubuzima.test");
    const bad = await manager("/clinicians", { name: "No Specialty", email: "ns@ubuzima.test", licenceNumber: "X-1" });
    expect(bad.body.fields).toHaveProperty("specialty");
    const ok = await manager("/clinicians", { name: "Test Nurse", email: "nurse@ubuzima.test", specialty: "MATERNITY", licenceNumber: "RNMC-1" });
    expect(ok.status).toBe(201);
    const list = (await manager("/clinicians")).body as { email: string }[];
    expect(list.some((c) => c.email === "nurse@ubuzima.test")).toBe(true);
    expect(list.some((c) => c.email === "kib.er@ubuzima.test")).toBe(false);

    // Another facility's clinician can't be touched.
    const other = await db.query(`select id from "Staff" where email = 'kib.er@ubuzima.test'`);
    expect((await manager(`/clinicians/${other.rows[0].id}/deactivate`, {})).status).toBe(404);
  });

  it("keeps deactivated clinicians and ends their sessions", async () => {
    const remera = await staffLogin("gp@ubuzima.test");
    expect((await remera("/auth/me")).status).toBe(200);
    const manager = await staffLogin("manager@ubuzima.test");
    const id = (await db.query(`select id from "Staff" where email = 'gp@ubuzima.test'`)).rows[0].id;
    expect((await manager(`/clinicians/${id}/deactivate`, {})).status).toBe(200);
    expect((await remera("/auth/me")).status).toBe(401);
    expect((await db.query(`select status from "Staff" where id = $1`, [id])).rows[0].status).toBe("DEACTIVATED");
  });
});

describe("schedules (FR 8.4, 8.5, 12.4)", () => {
  it("shows the manager their clinicians and the shifts missing a service", async () => {
    const manager = await staffLogin("manager@ubuzima.test");
    const week = await manager(`/schedule?week=${weekStart(currentShift().date)}`);
    expect(week.body.days).toHaveLength(7);
    expect(week.body.gaps).toHaveLength(14);
    expect(week.body.people.every((p: { specialty: string }) => p.specialty)).toBe(true);
  });

  it("shows the administrator every shift with no agent on it (NFR 12)", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const monday = weekStart(currentShift().date);
    await db.query(`delete from "ShiftAssignment" a using "Staff" s where s.id = a."staffId" and s.role = 'AGENT' and a.date = $1::date and a.shift = 'NIGHT'`, [monday]);
    const week = (await admin(`/schedule?week=${monday}`)).body;
    expect(week.gaps.find((g: { date: string; shift: string }) => g.date === monday && g.shift === "NIGHT").missing).toEqual(["AGENT"]);
  });

  it("shows the administrator the agents, not clinicians", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const week = await admin("/schedule");
    expect(week.body.people.map((p: { name: string }) => p.name).sort()).toEqual(["Diane Umutoni", "Eric Habineza"]);
  });

  it("lets a clinician mark a current or future shift unavailable, which counts as a gap", async () => {
    const c = await staffLogin("clinician@ubuzima.test");
    const manager = await staffLogin("manager@ubuzima.test");
    const mine = await c("/me/shifts");
    const now = mine.body.now;
    // Tomorrow, so the test also works on a Sunday, when no later day is left in this week.
    const tomorrow = new Date(Date.parse(`${now.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const me = (await c("/auth/me")).body;
    await manager("/schedule", { staffId: me.id, date: tomorrow, shift: "DAY", assigned: true }, "PUT");
    const week = weekStart(tomorrow);
    const upcoming = (await c(`/me/shifts?week=${week}`)).body.shifts.find((s: { date: string }) => s.date === tomorrow);
    expect(upcoming).toBeDefined();
    expect((await c(`/me/shifts/${upcoming.id}/unavailable`, { unavailable: true, reason: "Training" })).status).toBe(200);
    const sched = await manager(`/schedule?week=${week}`);
    const gap = sched.body.gaps.find((g: { date: string; shift: string }) => g.date === upcoming.date && g.shift === upcoming.shift);
    expect(gap.missing).toContain("EMERGENCY_CARE");

    const past = mine.body.shifts.find((s: { date: string }) => s.date < now.date);
    if (past) expect((await c(`/me/shifts/${past.id}/unavailable`, { unavailable: true })).status).toBe(400);
  });
});

describe("copying last week (D77)", () => {
  it("copies the week before into a coming week, keeps what is there, and is for managers only", async () => {
    const manager = await staffLogin("manager@ubuzima.test");
    const next = weekStart(new Date(Date.parse(`${currentShift().date}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));
    const thisWeek = (await manager(`/schedule?week=${weekStart(currentShift().date)}`)).body.assignments.length;
    const r = await manager("/schedule/copy", { week: next });
    expect(r.status).toBe(200);
    expect(r.body.added).toBe(thisWeek);
    expect((await manager(`/schedule?week=${next}`)).body.assignments.length).toBe(thisWeek);
    expect((await manager("/schedule/copy", { week: next })).body.added).toBe(0); // nothing twice
    const clinician = await staffLogin("clinician@ubuzima.test");
    expect((await clinician("/schedule/copy", { week: next })).status).toBe(403);
  });
});

describe("red flags and the AI switch (FR 12.6, 4.8)", () => {
  it("has the 23 Appendix C questions, and only the administrator can change them, with a log", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const list = (await admin("/red-flags")).body as { code: string }[];
    expect(list).toHaveLength(23);
    expect(list.map((q) => q.code)).toContain("P4");
    const added = await admin("/red-flags", { group: "A", textEn: "Is the sick person bleeding from the ears after a fall?", service: "SURGERY" });
    expect(added.status).toBe(201);
    const agent = await staffLogin("agent@ubuzima.test");
    expect((await agent("/red-flags")).status).toBe(403);
    const logged = await db.query(`select count(*)::int as n from "AuditEvent" where action = 'redflag.added'`);
    expect(logged.rows[0].n).toBe(1);
  });

  it("lets only the administrator switch the AI, and logs it", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    expect((await admin("/settings")).body.aiEnabled).toBe(true);
    expect((await admin("/settings", { aiEnabled: false }, "PUT")).status).toBe(200);
    expect((await admin("/settings")).body).toMatchObject({ aiEnabled: false, updatedBy: "Patrick Nkurunziza" });
    await admin("/settings", { aiEnabled: true }, "PUT");
    expect((await browser()("/settings")).status).toBe(401);
    const logged = await db.query(`select count(*)::int as n from "AuditEvent" where action like 'settings.ai.%'`);
    expect(logged.rows[0].n).toBe(2);
  });

  it("edits and removes questions; removed ones are kept for old cases", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const q = ((await admin("/red-flags")).body as { id: string; code: string }[]).find((x) => x.code === "A7")!;
    expect((await admin(`/red-flags/${q.id}`, { group: "A", textEn: "Was the sick person bitten by a snake or a dog?", service: "EMERGENCY_CARE" }, "PUT")).status).toBe(200);
    expect((await admin(`/red-flags/${q.id}`, undefined, "DELETE")).status).toBe(200);
    expect(((await admin("/red-flags")).body as { code: string }[]).some((x) => x.code === "A7")).toBe(false);
    expect((await db.query(`select active from "RedFlagQuestion" where id = $1`, [q.id])).rows[0].active).toBe(false);
  });
});

describe("account administration (FR 12.2, 12.3)", () => {
  it("changes a staff email so new codes go to the new address", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const id = (await db.query(`select id from "Staff" where email = 'agent2@ubuzima.test'`)).rows[0].id;
    expect((await admin(`/staff/${id}/email`, { email: "admin@ubuzima.test" }, "PUT")).status).toBe(409);
    expect((await admin(`/staff/${id}/email`, { email: "eric.h@ubuzima.test" }, "PUT")).status).toBe(200);
    await browser()("/auth/staff/reset", { email: "eric.h@ubuzima.test" });
    const sent = await db.query(`select count(*)::int as n from "EmailMessage" where "to" = 'eric.h@ubuzima.test'`);
    expect(sent.rows[0].n).toBe(1);
  });

  it("deactivates accounts without deleting them, and not your own", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const me = (await admin("/auth/me")).body.id;
    expect((await admin(`/staff/${me}/deactivate`, {})).status).toBe(400);
    const id = (await db.query(`select id from "Staff" where email = 'eric.h@ubuzima.test'`)).rows[0].id;
    expect((await admin(`/staff/${id}/deactivate`, {})).status).toBe(200);
    expect((await db.query(`select status from "Staff" where id = $1`, [id])).rows[0].status).toBe("DEACTIVATED");
  });
});
