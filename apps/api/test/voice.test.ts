import { beforeAll, describe, expect, it } from "vitest";
import { API, browser, codeIn, db, latestEmail, staffLogin } from "./client";
import { resetDatabase } from "./setup";

const ERIC = { nationalId: "1200180054377109", dateOfBirth: "2001-09-30", name: "Eric" };
const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" };
// The first bytes of a WebM file, as browsers record it, and a script pretending to be audio.
const WEBM = `data:audio/webm;codecs=opus;base64,${Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]).toString("base64")}`;
const FAKE = `data:audio/webm;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;

let caseId: string;
let patient: ReturnType<typeof browser>;
let agent: ReturnType<typeof browser>;

beforeAll(async () => {
  await resetDatabase();
  patient = browser();
  await patient("/auth/patient/login", ERIC);
  const me = (await patient("/auth/me")).body;
  caseId = (await patient("/cases/call", { subjectId: me.id, number: "0788123456", owner: "MINE" })).body.id;
  agent = await staffLogin("agent@ubuzima.test");
  await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
  let offer;
  for (let i = 0; i < 40 && !offer; i++) {
    offer = (await agent("/agent/state")).body.offer;
    if (!offer) await new Promise((r) => setTimeout(r, 250));
  }
  await agent(`/agent/offers/${offer.id}/accept`, {});
});

describe("voice notes in the chat (D74)", () => {
  it("lets the patient send one; the agent sees its length and can play it", async () => {
    const r = await patient(`/cases/${caseId}/voice`, { audio: WEBM, durationMs: 4200 });
    expect(r.status).toBe(201);
    const msg = (await agent(`/agent/cases/${caseId}`)).body.messages.find((m: { id: string }) => m.id === r.body.id);
    expect(msg).toMatchObject({ sender: "PATIENT", audioMs: 4200 });
    const audio = await fetch(`${API}/agent/cases/${caseId}/voice/${r.body.id}`, { headers: { cookie: await agentCookie() } });
    expect(audio.headers.get("content-type")).toContain("audio/webm");
    expect(Buffer.from(await audio.arrayBuffer()).subarray(0, 4).toString("hex")).toBe("1a45dfa3");
  });

  it("lets the agent send one, which the patient sees and can play", async () => {
    const r = await agent(`/agent/cases/${caseId}/voice`, { audio: WEBM, durationMs: 9000 });
    expect(r.status).toBe(201);
    const msg = (await patient(`/cases/${caseId}`)).body.messages.find((m: { id: string }) => m.id === r.body.id);
    expect(msg).toMatchObject({ sender: "AGENT", audioMs: 9000 });
    // D78: up to 2 minutes
    expect((await agent(`/agent/cases/${caseId}/voice`, { audio: WEBM, durationMs: 115_000 })).status).toBe(201);
  });

  it("refuses something that isn't audio, a note over 2 minutes, and other people", async () => {
    expect((await patient(`/cases/${caseId}/voice`, { audio: FAKE, durationMs: 3000 })).status).toBe(400);
    expect((await patient(`/cases/${caseId}/voice`, { audio: WEBM, durationMs: 150_000 })).status).toBe(400);
    expect((await patient(`/cases/${caseId}/voice`, { audio: "data:image/png;base64,AAAA", durationMs: 3000 })).status).toBe(400);
    const stranger = browser();
    await stranger("/auth/patient/login", ALINE);
    const any = (await db.query(`select "messageId" from "ChatAudio" limit 1`)).rows[0].messageId;
    expect((await stranger(`/cases/${caseId}/voice/${any}`)).status).toBe(404);
    expect((await stranger(`/cases/${caseId}/voice`, { audio: WEBM, durationMs: 3000 })).status).toBe(404);
  });
});

/** A second, separate agent session, logged in by hand so its cookie can be sent with a plain fetch. */
async function agentCookie() {
  const login = await fetch(`${API}/auth/staff/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "agent@ubuzima.test", password: "Ubuzima-demo-2026" }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const code = codeIn((await latestEmail("agent@ubuzima.test")).subject);
  await fetch(`${API}/auth/staff/code`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ code }) });
  return cookie;
}
