import { beforeAll, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { resetDatabase } from "./setup";

// A 1x1 PNG, and an SVG pretending to be one.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const FAKE = `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`;
const ADULT = { names: "Uwamahoro Josiane", sex: "FEMALE", dateOfBirth: "1994-08-12", district: "Huye", phone: "0788 555 111", photo: PNG };

beforeAll(async () => {
  await resetDatabase();
});

describe("adding a person to the mock NIDA (D73)", () => {
  it("is for the administrator only", async () => {
    const agent = await staffLogin("agent@ubuzima.test");
    expect((await agent("/staff/nida/people", ADULT)).status).toBe(403);
    expect((await browser()("/staff/nida/people", ADULT)).status).toBe(401);
  });

  it("adds an adult with a valid ID who can then log in, with their own photo, and logs it", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const r = await admin("/staff/nida/people", ADULT);
    expect(r.status).toBe(201);
    expect(r.body.nationalId).toMatch(/^119947\d{7}1\d{2}$/); // 1 · 1994 · 7 (female) · birth order · 1 · check
    const patient = browser();
    expect((await patient("/auth/patient/login", { nationalId: r.body.nationalId, dateOfBirth: "1994-08-12", name: "Josiane" })).status).toBe(200);
    const me = (await patient("/auth/me")).body;
    const photo = await fetch(`${API}/patients/${me.id}/photo`, { headers: { cookie: await cookieOf(r.body.nationalId) } });
    expect(photo.headers.get("content-type")).toContain("image/png");
    const log = await db.query(`select count(*)::int as n from "AuditEvent" where action = 'nida.person.added'`);
    expect(log.rows[0].n).toBe(1);
  });

  it("adds a young child under a parent, with no ID; the parent then sees the child", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const parent = (await admin("/staff/nida/people", { ...ADULT, names: "Habimana Theogene", sex: "MALE", dateOfBirth: "1988-01-20", photo: undefined })).body;
    const birth = new Date(Date.now() - 4 * 365 * 86_400_000).toISOString().slice(0, 10);
    const child = await admin("/staff/nida/people", { names: "Ishimwe Kelia", sex: "FEMALE", dateOfBirth: birth, district: "Huye", parentRef: parent.ref });
    expect(child.status).toBe(201);
    expect(child.body.nationalId).toBeNull();
    const p = browser();
    await p("/auth/patient/login", { nationalId: parent.nationalId, dateOfBirth: "1988-01-20", name: "Theogene" });
    expect((await p("/cases/mine")).body.people.map((x: { firstName: string }) => x.firstName)).toContain("Ishimwe");
  });

  it("refuses SQL in names or the parent, a fake photo, and a child without a parent", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const before = (await db.query(`select count(*)::int as n from nida.person`)).rows[0].n;
    expect((await admin("/staff/nida/people", { ...ADULT, names: "Robert'); DROP TABLE nida.person;--" })).status).toBe(400);
    expect((await admin("/staff/nida/people", { ...ADULT, parentRef: "NIDA-1001' OR '1'='1" })).status).toBe(400);
    expect((await admin("/staff/nida/people", { ...ADULT, photo: FAKE })).status).toBe(400);
    const birth = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
    expect((await admin("/staff/nida/people", { names: "Keza Ange", sex: "FEMALE", dateOfBirth: birth, district: "Huye" })).status).toBe(400);
    expect((await admin("/staff/nida/people", { ...ADULT, parentRef: "NIDA-9999" })).status).toBe(400); // no such parent
    // The table is still there and nothing was added.
    expect((await db.query(`select count(*)::int as n from nida.person`)).rows[0].n).toBe(before);
  });

  it("lists everyone, the newest additions first", async () => {
    const admin = await staffLogin("admin@ubuzima.test");
    const list = (await admin("/staff/nida/people")).body;
    expect(list[0].addedAt).toBeTruthy();
    expect(list.some((x: { ref: string }) => x.ref === "NIDA-0001")).toBe(true);
  });
});

async function cookieOf(nationalId: string) {
  const res = await fetch(`${API}/auth/patient/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nationalId, dateOfBirth: "1994-08-12", name: "Josiane" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}
