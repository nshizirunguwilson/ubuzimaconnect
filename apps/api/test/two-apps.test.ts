import { beforeAll, describe, expect, it } from "vitest";
import { API, codeIn, db, latestEmail } from "./client";
import { resetDatabase } from "./setup";

/** One browser holding both apps' cookies, as two tabs (or two incognito windows) share them (D76). */
function sharedBrowser() {
  const jar = new Map<string, string>();
  return async (path: string, body?: unknown, app?: "patient" | "staff") => {
    const res = await fetch(API + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), ...(app ? { "x-uc-app": app } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const [k, v] = [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)];
      if (v) jar.set(k, v);
      else jar.delete(k);
    }
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

beforeAll(async () => {
  await resetDatabase();
});

describe("a patient and a staff member in the same browser (D76)", () => {
  it("keeps the staff login when the patient logs out, and lets both work side by side", async () => {
    const b = sharedBrowser();
    expect((await b("/auth/patient/login", { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" })).status).toBe(200);
    expect((await b("/auth/staff/login", { email: "agent@ubuzima.test", password: "Ubuzima-demo-2026" })).status).toBe(200);
    // The patient tab logs out (or its 15-minute timer fires) while the staff tab waits for its code.
    expect((await b("/auth/logout", {}, "patient")).status).toBe(200);
    expect((await b("/auth/staff/code", { code: codeIn((await latestEmail("agent@ubuzima.test")).subject) })).status).toBe(200);
    expect((await b("/agent/state")).status).toBe(200);
    // Logging the patient in again doesn't touch the staff session.
    await b("/auth/patient/login", { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" });
    expect((await b("/auth/me", undefined, "patient")).body.kind).toBe("patient");
    expect((await b("/auth/me", undefined, "staff")).body.kind).toBe("staff");
    expect((await b("/cases/mine")).status).toBe(200);
    expect((await b("/agent/state")).status).toBe(200);
    // And the staff logout leaves the patient logged in.
    await b("/auth/logout", {}, "staff");
    expect((await b("/agent/state")).status).toBe(403); // the patient is still logged in: not allowed, not "log in"
    expect((await b("/cases/mine")).status).toBe(200);
  });
});

describe("why there is no session, for the login page", () => {
  it("tells an unfinished staff login from a session that ended after 15 idle minutes", async () => {
    const b = sharedBrowser();
    const state = async () => (await b("/auth/session", undefined, "staff")).body.state;
    const expireAll = () => db.query(`update "Session" set "expiresAt" = (now() at time zone 'utc') - interval '1 minute' where "staffId" = (select id from "Staff" where email = 'manager@ubuzima.test')`);
    expect(await state()).toBe("none");
    await b("/auth/staff/login", { email: "manager@ubuzima.test", password: "Ubuzima-demo-2026" });
    expect(await state()).toBe("unfinished"); // waiting for the code: back to the code screen, not "logged out"
    await expireAll();
    expect(await state()).toBe("unfinished-expired");
    await b("/auth/staff/login", { email: "manager@ubuzima.test", password: "Ubuzima-demo-2026" });
    await b("/auth/staff/code", { code: codeIn((await latestEmail("manager@ubuzima.test")).subject) });
    expect(await state()).toBe("live");
    await expireAll();
    expect(await state()).toBe("ended"); // the only case the login page says "after 15 minutes without activity"
    await b("/auth/logout", {}, "staff");
    expect(await state()).toBe("none");
  });
});
