import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { resetDatabase } from "./setup";

/**
 * NFR 5: a second API instance on the same database, as Azure runs behind its load balancer when scaled out.
 * Live events cross between instances through Postgres NOTIFY (DECISIONS.md D70).
 */
const B = "http://127.0.0.1:4098";
const DB = process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/ubuzima_test`;
const ERIC = { nationalId: "1200180054377109", dateOfBirth: "2001-09-30", name: "Eric" };
let second: ChildProcess;

beforeAll(async () => {
  await resetDatabase();
  second = spawn("node", ["apps/api/dist/main.js"], {
    cwd: resolve(import.meta.dirname, "../../.."),
    env: { ...process.env, DATABASE_URL: DB, DIRECT_URL: DB, PORT: "4098", NIDA_URL: "http://127.0.0.1:4199", WEB_URL: "http://localhost:3000", RESEND_API_KEY: "", DISPATCH_MS: "300", TIMER_MS: "300", OFFER_MS: "2500" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60 && !(await fetch(`${B}/health`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 250));
});
afterAll(() => second?.kill());

/** Reads a live stream until it contains `text`, or gives up after `ms`. */
async function streamUntil(url: string, cookie: string, text: string, act: () => Promise<unknown>, ms = 3000) {
  const ctrl = new AbortController();
  const res = await fetch(url, { headers: { cookie }, signal: ctrl.signal });
  const reader = res.body!.getReader();
  await new Promise((r) => setTimeout(r, 300)); // the stream is subscribed before the event is sent
  const sentAt = Date.now();
  await act();
  let got = "";
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    while (!got.includes(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      got += new TextDecoder().decode(value);
    }
  } catch {
    /* timed out */
  }
  clearTimeout(timer);
  ctrl.abort();
  return { found: got.includes(text), ms: Date.now() - sentAt };
}

describe("two API instances (NFR 5)", () => {
  it("delivers a chat message sent through one instance to a patient connected to the other, within 3 seconds", async () => {
    expect((await fetch(`${B}/health`)).ok).toBe(true);
    const patient = browser();
    await patient("/auth/patient/login", ERIC);
    const me = (await patient("/auth/me")).body;
    const id = (await patient("/cases/call", { subjectId: me.id, number: "0788123456", owner: "MINE" })).body.id;
    const agent = await staffLogin("agent@ubuzima.test");
    await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
    let offer;
    for (let i = 0; i < 40 && !offer; i++) {
      offer = (await agent("/agent/state")).body.offer;
      if (!offer) await new Promise((r) => setTimeout(r, 250));
    }
    expect((await agent(`/agent/offers/${offer.id}/accept`, {})).status).toBe(200);

    // The patient's browser is connected to instance B; the agent sends through instance A.
    const cookie = (await fetch(`${API}/auth/patient/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ERIC) })).headers.get("set-cookie")!.split(";")[0];
    const toPatient = await streamUntil(`${B}/events/cases/${id}`, cookie, "sent through instance A", () => agent(`/agent/cases/${id}/messages`, { text: "Hello, sent through instance A" }));
    expect(toPatient.found).toBe(true);
    expect(toPatient.ms).toBeLessThan(3000);

    // And back: the patient sends through instance B; a stream on instance A sees it.
    const toAgent = await streamUntil(`${API}/events/cases/${id}`, cookie, "Better, sent through B", () =>
      fetch(`${B}/cases/${id}/messages`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ text: "Better, sent through B" }) }),
    );
    expect(toAgent.found).toBe(true);
    expect(toAgent.ms).toBeLessThan(3000);
    await agent(`/agent/cases/${id}/close`, { outcome: "ADVISED_REMOTELY", note: "Advice given in the chat." });
  });

  it("has every instance listening for the others' events", async () => {
    const locks = await db.query(`select count(*)::int as n from pg_stat_activity where datname = current_database() and query ilike '%LISTEN uc_live%'`);
    expect(locks.rows[0].n).toBeGreaterThanOrEqual(2); // both instances are listening
  });
});
