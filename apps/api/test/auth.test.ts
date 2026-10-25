import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDatabase } from "./setup";
import { browser, codeIn, db, expireLocks, latestEmail, linkTokenIn, NIDA } from "./client";

const ALINE = { nationalId: "1 1992 7 0045823 1 16", dateOfBirth: "1992-03-14", name: "Uwase" };
const PASSWORD = "Ubuzima-demo-2026";

beforeAll(resetDatabase);
afterAll(() => db.end());

describe("patient login (FR 1)", () => {
  it("logs in with ID, date of birth and one name, and links the children (FR 1.1 to 1.3)", async () => {
    const b = browser();
    expect((await b("/auth/patient/login", ALINE)).status).toBe(200);
    const me = await b("/auth/me");
    expect(me.body).toMatchObject({ kind: "patient", firstName: "Aline", sharedDevice: false });
    expect(me.body.family.map((f: { name: string }) => f.name)).toEqual(["Kevin Ishimwe", "Grace Ineza"]);
  });

  it("never stores the national ID itself (NFR 4)", async () => {
    const r = await db.query(`select count(*)::int as n from "Patient" where "nidHash" like '%1199270045823116%' or "nidaRef" like '%1199270045823116%'`);
    expect(r.rows[0].n).toBe(0);
  });

  it("gives a parent all their children at any age, and a child of 16+ only their own record (FR 1.3)", async () => {
    const parent = browser();
    await parent("/auth/patient/login", { nationalId: "1198580067412163", dateOfBirth: "1985-07-01", name: "Habimana" });
    const names = (await parent("/auth/me")).body.family.map((f: { name: string }) => f.name);
    expect(names).toEqual(["Ange Iradukunda", "Divine Mutoni"]);

    const teen = browser();
    expect((await teen("/auth/patient/login", { nationalId: "1200970031504128", dateOfBirth: "2009-05-21", name: "Ange" })).status).toBe(200);
    expect((await teen("/auth/me")).body).toMatchObject({ firstName: "Ange", family: [] });
  });

  it("logs every login with the device type (FR 10.1)", async () => {
    const r = await db.query(`select detail from "AuditEvent" where action = 'patient.login' order by "createdAt" desc limit 1`);
    expect(r.rows[0].detail).toHaveProperty("device");
  });

  it("serves the photo only to the person, their parent or staff (FR 1.10)", async () => {
    const aline = browser();
    await aline("/auth/patient/login", ALINE);
    const { body } = await aline("/auth/me");
    const eric = browser();
    await eric("/auth/patient/login", { nationalId: "1200180054377109", dateOfBirth: "2001-09-30", name: "Eric" });
    const childPhoto = `/patients/${body.family[0].id}/photo`;
    expect((await aline(childPhoto)).status).not.toBe(403);
    expect((await eric(childPhoto)).status).toBe(403);
  });

  it("gives one answer for any wrong detail and locks the ID after 5 tries (FR 1.4, 1.6)", async () => {
    const b = browser();
    const wrong = { nationalId: "1199670078215135", dateOfBirth: "1996-04-18", name: "Marie" };
    for (let i = 4; i >= 1; i--) {
      const r = await b("/auth/patient/login", wrong);
      expect(r.body).toMatchObject({ code: "INVALID_CREDENTIALS", fields: { attemptsLeft: String(i) } });
    }
    expect((await b("/auth/patient/login", wrong)).body.code).toBe("LOCKED");
    // Even the right details are refused while locked.
    const right = await b("/auth/patient/login", { ...wrong, name: "Claudine" });
    expect(right.status).toBe(423);
  });

  it("says verification is unavailable when NIDA is down, without counting a failure (FR 1.5)", async () => {
    const outage = (on: boolean) =>
      fetch(`${NIDA}/v1/outage`, { method: "POST", headers: { "x-api-key": "dev-nida-key", "content-type": "application/json" }, body: JSON.stringify({ on }) });
    await outage(true);
    const r = await browser()("/auth/patient/login", ALINE);
    await outage(false);
    expect(r).toMatchObject({ status: 503, body: { code: "NIDA_UNAVAILABLE", message: "Verification is temporarily unavailable." } });
    const logged = await db.query(`select count(*)::int as n from "AuditEvent" where action = 'nida.unavailable'`);
    expect(logged.rows[0].n).toBeGreaterThan(0);
  });

  it("ends the session on a shared phone when the browser closes (FR 1.8)", async () => {
    const res = await fetch("http://127.0.0.1:4099/auth/patient/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...ALINE, sharedDevice: true }),
    });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
  });
});

describe("staff login (FR 2)", () => {
  it("needs the password and then the emailed code (FR 2.1, 2.2)", async () => {
    const b = browser();
    expect((await b("/auth/staff/login", { email: "agent@ubuzima.test", password: PASSWORD })).body.next).toBe("code");
    // Before the code, the session gives no access.
    expect((await b("/auth/me")).status).toBe(401);
    expect((await b("/auth/staff/code", { code: "000000" })).body.code).toBe("CODE_INVALID");
    const code = codeIn((await latestEmail("agent@ubuzima.test")).subject);
    expect((await b("/auth/staff/code", { code })).status).toBe(200);
    expect((await b("/auth/me")).body).toMatchObject({ kind: "staff", role: "AGENT" });
  });

  it("only lets an administrator see staff accounts (FR 10.3)", async () => {
    const b = browser();
    await b("/auth/staff/login", { email: "agent@ubuzima.test", password: PASSWORD });
    await b("/auth/staff/code", { code: codeIn((await latestEmail("agent@ubuzima.test")).subject) });
    expect((await b("/staff")).status).toBe(403);
  });

  it("locks for 15 minutes after 5 wrong passwords, then needs an email code (FR 2.3, 2.4)", async () => {
    const email = "agent2@ubuzima.test";
    const b = browser();
    for (let i = 0; i < 4; i++) expect((await b("/auth/staff/login", { email, password: "wrong" })).status).toBe(401);
    expect((await b("/auth/staff/login", { email, password: "wrong" })).body.code).toBe("LOCKED");
    expect((await b("/auth/staff/login", { email, password: PASSWORD })).body.code).toBe("LOCKED");

    await expireLocks();
    for (let i = 0; i < 4; i++) await b("/auth/staff/login", { email, password: "wrong" });
    expect((await b("/auth/staff/login", { email, password: "wrong" })).body.code).toBe("LOCKED_EMAIL_UNLOCK");
    expect((await b("/auth/staff/login", { email, password: PASSWORD })).body.code).toBe("LOCKED_EMAIL_UNLOCK");

    const code = codeIn((await latestEmail(email)).text);

    // FR 2.4: a password reset does not unlock; only the emailed unlock code does.
    await b("/auth/staff/reset", { email });
    const token = linkTokenIn((await latestEmail(email)).text);
    expect((await b("/auth/staff/password", { token, password: PASSWORD })).status).toBe(200);
    expect((await b("/auth/staff/login", { email, password: PASSWORD })).body.code).toBe("LOCKED_EMAIL_UNLOCK");

    expect((await b("/auth/staff/unlock", { email, code })).status).toBe(200);
    expect((await b("/auth/staff/login", { email, password: PASSWORD })).body.next).toBe("code");
  });

  it("invites staff, and the link sets the first password only once (FR 2.6)", async () => {
    const admin = browser();
    await admin("/auth/staff/login", { email: "admin@ubuzima.test", password: PASSWORD });
    await admin("/auth/staff/code", { code: codeIn((await latestEmail("admin@ubuzima.test")).subject) });
    // FR 12.1: the administrator invites agents (with a licence number) and facility managers, not clinicians.
    expect((await admin("/staff/invitations", { name: "X", email: "x@ubuzima.test", role: "CLINICIAN" })).status).toBe(400);
    expect((await admin("/staff/invitations", { name: "No Licence", email: "y@ubuzima.test", role: "AGENT" })).body.fields).toHaveProperty("licenceNumber");
    const invite = await admin("/staff/invitations", {
      name: "Test Agent",
      email: "new.agent@ubuzima.test",
      role: "AGENT",
      licenceNumber: "RNMC-99999",
    });
    expect(invite.status).toBe(201);

    // FR 2.6: a new invitation replaces the old link.
    const first = linkTokenIn((await latestEmail("new.agent@ubuzima.test")).text);
    expect((await admin(`/staff/${invite.body.id}/invitation`, {})).status).toBe(200);
    const token = linkTokenIn((await latestEmail("new.agent@ubuzima.test")).text);
    expect(token).not.toBe(first);
    const b = browser();
    expect((await b(`/auth/staff/links/${first}`)).body.code).toBe("TOKEN_INVALID");
    expect((await b(`/auth/staff/links/${token}`)).body).toMatchObject({ purpose: "INVITATION", name: "Test Agent" });
    expect((await b("/auth/staff/password", { token, password: "short" })).body.code).toBe("VALIDATION");
    expect((await b("/auth/staff/password", { token, password: "a long enough password" })).status).toBe(200);
    expect((await b("/auth/staff/password", { token, password: "another long password" })).body.code).toBe("TOKEN_INVALID");
    expect((await b("/auth/staff/login", { email: "new.agent@ubuzima.test", password: "a long enough password" })).body.next).toBe("code");
    expect((await admin(`/staff/${invite.body.id}/invitation`, {})).status).toBe(409);
  });

  it("answers a reset request the same way for unknown emails, and the reset ends old sessions (FR 2.7)", async () => {
    const b = browser();
    expect((await b("/auth/staff/reset", { email: "nobody@ubuzima.test" })).body).toEqual({ ok: true });

    const email = "manager@ubuzima.test";
    const old = browser();
    await old("/auth/staff/login", { email, password: PASSWORD });
    await old("/auth/staff/code", { code: codeIn((await latestEmail(email)).subject) });
    expect((await old("/auth/me")).status).toBe(200);

    await b("/auth/staff/reset", { email });
    const token = linkTokenIn((await latestEmail(email)).text);
    expect((await b("/auth/staff/password", { token, password: "a brand new password" })).status).toBe(200);
    expect((await old("/auth/me")).status).toBe(401);
  });

  it("ends a session after 15 minutes without activity (FR 2.5)", async () => {
    const b = browser();
    await b("/auth/staff/login", { email: "admin@ubuzima.test", password: PASSWORD });
    await b("/auth/staff/code", { code: codeIn((await latestEmail("admin@ubuzima.test")).subject) });
    expect((await b("/auth/me")).status).toBe(200);
    await db.query(`update "Session" set "expiresAt" = now() at time zone 'utc' - interval '1 second' where "staffId" is not null`);
    expect((await b("/auth/me")).status).toBe(401);
  });
});

describe("patient session (FR 1.7)", () => {
  it("ends a patient session after 15 minutes without activity", async () => {
    const b = browser();
    expect((await b("/auth/patient/login", { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" })).status).toBe(200);
    expect((await b("/auth/me")).status).toBe(200);
    const row = (await db.query(`select "expiresAt" - "lastSeenAt" as idle from "Session" where "patientId" is not null order by "createdAt" desc limit 1`)).rows[0];
    expect(row.idle.minutes ?? row.idle.hours * 60).toBe(15); // the session lasts 15 minutes from the last request
    await db.query(`update "Session" set "expiresAt" = now() at time zone 'utc' - interval '1 second' where "patientId" is not null`);
    expect((await b("/auth/me")).status).toBe(401);
  });
});

describe("mock NIDA access", () => {
  it("refuses calls without the right key", async () => {
    const r = await fetch(`${NIDA}/v1/verify`, { method: "POST", headers: { "x-api-key": "wrong" } });
    expect(r.status).toBe(401);
  });
});
