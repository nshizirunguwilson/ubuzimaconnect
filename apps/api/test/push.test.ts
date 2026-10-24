import { PUSH_TEXT, currentShift } from "@ubuzima/shared";
import { createDecipheriv, createECDH, createHmac, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { API, browser, db, staffLogin } from "./client";
import { startFakeGemini } from "./fake-gemini";
import { resetDatabase } from "./setup";

/**
 * This file plays the browser's push service (like Google's or Mozilla's): the API sends encrypted
 * notifications to it, and it decrypts them as a browser would (RFC 8291), to check what they say.
 */
const PUSH_PORT = 4298;
const KIGALI = { source: "GPS", latitude: -1.95, longitude: 30.09 };
const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" };
const b64u = (b: Buffer) => b.toString("base64url");
const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

type Received = { path: string; body: Buffer; headers: Record<string, string | string[] | undefined> };
let received: Received[] = [];
let server: Server;
let gemini: ReturnType<typeof startFakeGemini>;

/** A browser's push keys: an ECDH P-256 pair and a 16-byte auth secret. */
function device(name: string, status = 201) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  statuses.set(`/push/${name}`, status);
  return {
    sub: { endpoint: `http://127.0.0.1:${PUSH_PORT}/push/${name}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } },
    /** RFC 8291 + RFC 8188 (aes128gcm): what the browser does before showing the notification. */
    open(body: Buffer) {
      const salt = body.subarray(0, 16);
      const idlen = body[20];
      const serverKey = body.subarray(21, 21 + idlen);
      const cipher = body.subarray(21 + idlen);
      const shared = ecdh.computeSecret(serverKey);
      const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), serverKey, Buffer.from([1])]));
      const prk = hmac(salt, ikm);
      const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
      const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
      const d = createDecipheriv("aes-128-gcm", cek, nonce);
      d.setAuthTag(cipher.subarray(cipher.length - 16));
      const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
      return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString("utf8"));
    },
  };
}
const statuses = new Map<string, number>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T | null | undefined | false, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await wait(100);
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
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ path: req.url!, body: Buffer.concat(chunks), headers: req.headers });
      res.writeHead(statuses.get(req.url!) ?? 201).end();
    });
  });
  await new Promise<void>((r) => server.listen(PUSH_PORT, "127.0.0.1", r));
});
afterAll(async () => {
  server.close();
  await gemini.close();
  await db.end();
});
beforeEach(async () => {
  received = [];
  await db.query(`update "Case" set status = 'CLOSED' where status <> 'CLOSED'`);
  await db.query(`update "Routing" set status = 'CANCELLED' where status in ('SUGGESTED', 'CONFIRMED', 'ARRIVED')`);
  await db.query(`update "BedReservation" set status = 'RELEASED' where status = 'HELD'`);
});

/** Logs Aline in and keeps her cookie, so the test can also open her live stream like the app does. */
async function aline(shared = false) {
  const res = await fetch(`${API}/auth/patient/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ALINE, sharedDevice: shared }) });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const call = (path: string, body?: unknown, method?: string) =>
    fetch(API + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  return { call, cookie, me: (await call("/auth/me")).body };
}

/** A case Aline opened, handled by agent@ (given directly, with the agent counted as connected). */
async function handled(a: Awaited<ReturnType<typeof aline>>) {
  const id = (await a.call("/cases", { subjectId: a.me.id, location: KIGALI })).body.id as string;
  await db.query(`update "Case" set status = 'ASSIGNED', "triageLevel" = 'MINOR', "agentId" = (select id from "Staff" where email = 'agent@ubuzima.test'), "assignedAt" = now() where id = $1`, [id]);
  await db.query(`update "Staff" set "agentStatus" = 'BUSY', "lastSeenAt" = (now() at time zone 'utc') + interval '1 hour' where email = 'agent@ubuzima.test'`);
  return id;
}

describe("push notifications (FR 6.6, NFR 13, FR 1.8)", () => {
  it("gives the browser the server's public key", async () => {
    const key = (await (await fetch(`${API}/push/key`)).json()).publicKey as string;
    expect(Buffer.from(key, "base64url")).toHaveLength(65);
  });

  it("sends the patient only “You have a new message” when the agent writes and the app is closed", async () => {
    const a = await aline();
    const phone = device("aline-phone");
    expect((await a.call("/push/subscriptions", phone.sub)).status).toBe(201);
    const id = await handled(a);
    const agent = await staffLogin("agent@ubuzima.test");
    await agent(`/agent/cases/${id}/messages`, { text: "Your malaria test is positive; take the medicine I prescribe." });

    const got = await until(() => received.find((r) => r.path === "/push/aline-phone"));
    expect(got.headers["content-encoding"]).toBe("aes128gcm");
    expect(got.headers.authorization).toMatch(/^vapid t=/);
    const shown = phone.open(got.body);
    // NFR 13: the title and body are fixed; only the link to open differs.
    expect(shown).toEqual({ ...PUSH_TEXT, url: `/cases/${id}` });
    expect(JSON.stringify(shown)).not.toMatch(/malaria|Aline|positive/i);
  });

  it("sends nothing while the patient has the app open", async () => {
    const a = await aline();
    const phone = device("aline-open");
    await a.call("/push/subscriptions", phone.sub);
    const id = await handled(a);
    const live = new AbortController();
    const stream = await fetch(`${API}/events/cases/${id}`, { headers: { cookie: a.cookie }, signal: live.signal });
    expect(stream.status).toBe(200);
    const agent = await staffLogin("agent@ubuzima.test");
    await agent(`/agent/cases/${id}/messages`, { text: "Are you still there?" });
    await wait(800);
    expect(received.filter((r) => r.path === "/push/aline-open")).toHaveLength(0);
    live.abort();
  });

  it("never turns notifications on for a shared device (FR 1.8)", async () => {
    const a = await aline(true);
    expect((await a.call("/push/subscriptions", device("library-pc").sub)).status).toBe(409);
  });

  it("tells a clinician a patient is on the way, and forgets a browser that has gone", async () => {
    const er = await staffLogin("clinician@ubuzima.test");
    const laptop = device("er-laptop", 410);
    expect((await er("/push/subscriptions", laptop.sub)).status).toBe(201);
    // An urgent case is routed to this clinician at once (FR 5.12): the push goes out, the service says "gone".
    const b = browser();
    await b("/auth/patient/login", ALINE);
    const me = (await b("/auth/me")).body;
    const id = (await b("/cases", { subjectId: me.id, location: KIGALI })).body.id;
    let v = (await b(`/cases/${id}`)).body;
    if (v.stage === "PREGNANCY") v = (await b(`/cases/${id}/pregnancy`, { pregnant: false })).body;
    v = (await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: false })).body;
    await b(`/cases/${id}/answers`, { questionId: v.question.id, answer: true });

    const got = await until(() => received.find((r) => r.path === "/push/er-laptop"));
    expect(laptop.open(got.body)).toEqual({ ...PUSH_TEXT, url: "/staff/patients" });
    await until(async () => true);
    await wait(300);
    expect((await db.query(`select count(*)::int as n from "PushSubscription" where endpoint like '%er-laptop'`)).rows[0].n).toBe(0);
  });
});
