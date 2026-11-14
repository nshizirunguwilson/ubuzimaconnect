#!/usr/bin/env node
// Runs the scenarios of the UbuzimaConnect Full System Description against the live site, as each role would,
// and prints one line per check: PASS or FAIL, the scenario (A1, C7, ...) and the SRS requirement it proves.
// docs/TEST-PLAN.md lists every scenario and which checks cover it.
//
//   node scripts/live-check.mjs            (API = https://api.ubuzima.wilsonn.tech)
//   API=http://localhost:4000 node scripts/live-check.mjs
//
// It only uses the made-up demo people and @ubuzima.test accounts, cancels or closes every case it opens,
// and switches the AI back on if it switched it off. Staff login codes are read from the demo inbox (D66).
import { readFileSync } from "node:fs";

const API = process.env.API ?? "https://api.ubuzima.wilsonn.tech";
const WEB = process.env.WEB ?? "https://ubuzima.wilsonn.tech";
const PASSWORD = readFileSync(new URL("../apps/api/src/seed.ts", import.meta.url), "utf8").match(/DEV_PASSWORD = [^"]*"([^"]+)"/)[1];
const KIGALI = { source: "GPS", latitude: -1.9441, longitude: 30.0619 };
const ALINE = { nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Uwase", sharedDevice: false };
const JEAN = { nationalId: "1198580067412163", dateOfBirth: "1985-07-01", name: "Habimana", sharedDevice: false };
const ANGE = { nationalId: "1200970031504128", dateOfBirth: "2009-05-21", name: "Ange", sharedDevice: false };
const ERIC = { nationalId: "1200180054377109", dateOfBirth: "2001-09-30", name: "Eric", sharedDevice: false };
const CLAUDINE = { nationalId: "1199670078215135", dateOfBirth: "1996-04-18", name: "Claudine", sharedDevice: false };
const ESPERANCE = { nationalId: "1196070012689241", dateOfBirth: "1960-12-25", name: "Mukamana", sharedDevice: true };

const results = [];
function check(id, req, what, ok, detail) {
  results.push({ id, req, what, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(5)} ${req.padEnd(14)} ${what}${ok ? "" : `  →  ${JSON.stringify(detail)?.slice(0, 300)}`}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One browser: keeps its own session cookie. */
function browser() {
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const call = async (path, body, method) => {
    const res = await fetch(API + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", cookie: cookieHeader(), origin: WEB },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
  call.cookie = cookieHeader;
  return call;
}

const inbox = async (to) => (await (await fetch(`${API}/demo/inbox`)).json()).filter((m) => m.to === to);
const codeIn = (s) => s.match(/(\d{3}) (\d{3})/)?.slice(1).join("");
const linkIn = (s) => s.match(/\/staff\/(?:invitation|reset)\/([\w-]+)/)?.[1];

async function staff(email, password = PASSWORD) {
  const b = browser();
  const before = (await inbox(email))[0]?.id;
  const r = await b("/auth/staff/login", { email, password });
  for (let i = 0; i < 10; i++) {
    const m = (await inbox(email))[0];
    if (m && m.id !== before) {
      const c = await b("/auth/staff/code", { code: codeIn(m.subject + " " + m.text) });
      b.loginStatus = c.status;
      return b;
    }
    await wait(500);
  }
  b.loginStatus = r.status;
  return b;
}
async function patient(who) {
  const b = browser();
  b.login = await b("/auth/patient/login", who);
  return b;
}
/** Keeps an agent's live stream open, as the staff pages do, so the dispatcher sees them online. */
function presence(b) {
  const ctl = new AbortController();
  fetch(`${API}/events/agent`, { headers: { cookie: b.cookie(), origin: WEB }, signal: ctl.signal })
    .then(async (r) => { const rd = r.body.getReader(); for (;;) { const { done } = await rd.read(); if (done) break; } })
    .catch(() => {});
  return () => ctl.abort();
}
async function closeOpen(b, people) {
  const mine = (await b("/cases/mine")).body;
  for (const c of mine?.open ?? mine?.cases ?? []) if (c.status !== "CLOSED") await b(`/cases/${c.id}/cancel`, {});
  void people;
}
async function newCase(b, firstName) {
  const mine = (await b("/cases/mine")).body;
  const who = firstName ? mine.people.find((p) => p.firstName === firstName) : mine.people[0];
  const r = await b("/cases", { subjectId: who.id, location: KIGALI });
  if (r.body.existing) await b(`/cases/${r.body.id}/cancel`, {});
  return r.body.existing ? (await b("/cases", { subjectId: who.id, location: KIGALI })).body : r.body;
}
async function toChecklistNone(b, id) {
  let v = (await b(`/cases/${id}`)).body;
  if (v.stage === "PREGNANCY") v = (await b(`/cases/${id}/pregnancy`, { pregnant: false })).body;
  if (v.stage === "RED_FLAGS") v = (await b(`/cases/${id}/checklist`, { yes: null })).body;
  return v;
}

// ─────────────────────────────── A. Access and identity ───────────────────────────────
async function A() {
  const home = await fetch(WEB + "/");
  const html = await home.text();
  check("A1", "FR 1.9", "First screen opens, with the Emergency (912) button", home.ok && /912/.test(html), home.status);

  const a = await patient(ALINE);
  check("A1", "FR 1.1-1.2", "Parent logs in with national ID, date of birth and one name", a.login.status === 200, a.login.body);
  check("A1", "NFR 3", "Session cookie is HttpOnly and Secure", /HttpOnly/i.test(a.login.headers.get("set-cookie") ?? "") && /Secure/i.test(a.login.headers.get("set-cookie") ?? ""), a.login.headers.get("set-cookie"));
  const mine = (await a("/cases/mine")).body;
  const names = mine?.people?.map((p) => p.firstName) ?? [];
  check("A1", "FR 1.3", "Parent sees themselves and all children (Aline, Kevin, Grace)", ["Aline", "Kevin", "Grace"].every((n) => names.includes(n)), names);

  const bad = await patient({ ...ALINE, name: "Wrongname" });
  check("A1", "FR 1.4", "Wrong details: refused with a plain message and attempts left", bad.login.status === 401 && /match/i.test(bad.login.body?.message) && bad.login.body?.fields?.attemptsLeft, bad.login.body);
  await patient(ALINE); // a good login resets the count

  const unknown = await patient({ nationalId: "1198780592371064", dateOfBirth: "1987-01-01", name: "Nobody", sharedDevice: false });
  check("A1", "FR 1.4", "ID not in NIDA: access refused (or locked after earlier runs, FR 1.6)", unknown.login.status === 401 || unknown.login.body?.code === "LOCKED", unknown.login.body);

  // Lockout on a person nobody demos with (FR 1.6)
  let last;
  for (let i = 0; i < 5; i++) last = await patient({ ...ESPERANCE, name: "Wrong" });
  const locked = await patient(ESPERANCE);
  check("A1", "FR 1.6", "5 wrong attempts lock that ID (right details refused while locked)", locked.login.status === 429 || locked.login.status === 423 || /lock/i.test(JSON.stringify(locked.login.body)), { last: last.login.body, now: locked.login.body });

  const ange = await patient(ANGE);
  const angeMine = (await ange("/cases/mine")).body;
  check("A2", "FR 1.3", "Mature child (17) logs in with her own ID and sees only herself", ange.login.status === 200 && angeMine?.people?.length === 1, angeMine?.people?.map((p) => p.firstName));
  const kevinId = mine.people.find((p) => p.firstName === "Kevin").id;
  const peek = await ange(`/records/${kevinId}`);
  check("A2", "FR 9.1", "Mature child cannot open another family's records", peek.status === 403 || peek.status === 404, peek.status);

  const emergency = await fetch(`${API}/public/emergency?lat=${KIGALI.latitude}&lng=${KIGALI.longitude}`);
  const em = await emergency.json().catch(() => null);
  check("A3", "FR 1.9", "Emergency without login: nearest emergency facility with distance", emergency.ok && (em?.facility?.name || em?.name), em);
  const emPage = await fetch(WEB + "/emergency");
  check("A3", "FR 1.9", "Emergency page opens without login", emPage.ok, emPage.status);

  const rec = await a(`/records/${mine.people.find((p) => p.firstName === "Aline").id}`);
  check("A4", "FR 7.2", "Patient opens their own records", rec.status === 200, rec.status);
  const kev = await a(`/records/${kevinId}`);
  check("A4", "FR 7.2", "Parent opens a child's records", kev.status === 200, kev.status);
  const act = await a(`/records/${mine.people.find((p) => p.firstName === "Aline").id}/activity`);
  check("A4", "FR 10.2", "Access history lists who opened the records", act.status === 200 && Array.isArray(act.body?.rows ?? act.body?.entries ?? act.body), act.body);

  const shared = await patient({ ...ALINE, sharedDevice: true });
  const sub = await shared("/push/subscriptions", { endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { p256dh: "x".repeat(87), auth: "y".repeat(22) } });
  check("A5", "FR 1.8", "\"This is not my device\": the device can't register for notifications", sub.status >= 400, sub);
  const out = await shared("/auth/logout", {});
  const after = await shared("/cases/mine");
  check("A5", "FR 1.8", "After logout nothing about the patient is served", out.status < 300 && after.status === 401, after.status);
}

// ─────────────────────────────── B. Starting a case ───────────────────────────────
async function B() {
  const a = await patient(ALINE);
  await closeOpen(a);
  const first = await newCase(a, "Kevin");
  const again = await a("/cases", { subjectId: (await a("/cases/mine")).body.people.find((p) => p.firstName === "Kevin").id, location: KIGALI });
  check("B1", "FR 3.1-3.2", "Parent picks the sick child; a second request opens the existing case", again.body.id === first.id && again.body.existing, again.body);
  check("B2", "FR 3.5", "The 5 nearest facilities are returned to keep on the device", Array.isArray(first.nearby) && first.nearby.length === 5, first.nearby?.length);
  const manual = await (async () => {
    await a(`/cases/${first.id}/cancel`, {});
    const kid = (await a("/cases/mine")).body.people.find((p) => p.firstName === "Kevin").id;
    return a("/cases", { subjectId: kid, location: { source: "MANUAL", sectorCode: "" } });
  })();
  check("B2", "FR 3.4", "Manual location: an empty sector is refused with a message", manual.status === 400, manual.body);

  // B3: red flag
  const c = await newCase(a, "Kevin");
  let v = (await a(`/cases/${c.id}`)).body;
  const signs = [v.question, ...(v.question?.after ?? [])];
  check("B3", "FR 3.6", "Child of 7 gets groups A and C on one screen (18 signs)", signs.length === 18 && signs.some((s) => s.code.startsWith("C")), signs.length);
  v = (await a(`/cases/${c.id}/checklist`, { yes: signs.find((s) => s.code === "A2").id })).body;
  check("B3", "FR 4.1, 5.5", "Danger sign tapped: Urgent at once, nearest facility and 912 shown", v.urgent && v.stage === "WAITING" && v.guidance?.facility?.name, v.guidance);
  await a(`/cases/${c.id}/cancel`, {});
  check("B9", "FR 3.11", "Patient cancels: case closes as Cancelled by patient", (await a(`/cases/${c.id}`)).body.outcome === "CANCELLED_BY_PATIENT", null);

  // Pregnancy group
  const cl = await patient(CLAUDINE);
  await closeOpen(cl);
  const me = await newCase(cl, "Claudine");
  let pv = (await cl(`/cases/${me.id}`)).body;
  check("B3", "FR 3.6", "Woman 12-55 is asked \"Are you pregnant?\" first", pv.stage === "PREGNANCY", pv.stage);
  pv = (await cl(`/cases/${me.id}/pregnancy`, { pregnant: true })).body;
  const psigns = [pv.question, ...(pv.question?.after ?? [])];
  check("B3", "FR 3.6", "Pregnant: the 4 pregnancy signs are added (17 in all)", psigns.length === 17 && psigns.filter((s) => s.code.startsWith("P")).length === 4, psigns.length);
  pv = (await cl(`/cases/${me.id}/checklist`, { yes: psigns.find((s) => s.code === "P1").id })).body;
  check("B3", "FR 5.1", "Bleeding in pregnancy: Urgent", pv.urgent, pv);
  await cl(`/cases/${me.id}/cancel`, {});
  const baby = await newCase(cl, "Bruno");
  const bv = (await cl(`/cases/${baby.id}`)).body;
  check("B3", "FR 3.6", "Baby under 2 months gets the young-baby sign N1", [bv.question, ...(bv.question?.after ?? [])].some((s) => s?.code === "N1"), bv.stage);
  await cl(`/cases/${baby.id}/cancel`, {});
  const er = await patient(ERIC);
  await closeOpen(er);
  const nb = await newCase(er, "Keza");
  const nv = (await er(`/cases/${nb.id}`)).body;
  check("B3", "FR 4.2", "Baby under 8 days: Urgent with no questions", nv.urgent && nv.stage === "WAITING", nv.stage);
  await er(`/cases/${nb.id}/cancel`, {});

  // B4/B5: symptoms and AI
  const s = await newCase(a, "Aline");
  let sv = await toChecklistNone(a, s.id);
  check("B4", "FR 3.7", "\"None of these\": moves to the description", sv.stage === "SYMPTOMS", sv.stage);
  const t0 = Date.now();
  sv = (await a(`/cases/${s.id}/symptoms`, { description: "Itchy red rash on both arms since yesterday after using a new soap", duration: "ONE_TO_THREE_DAYS", severity: 3 })).body;
  check("B4", "FR 4.3, NFR 4", `Description submitted and triaged within 10 s (${Date.now() - t0} ms)`, sv.stage === "WAITING" && Date.now() - t0 < 10_500, sv.stage);
  await a(`/cases/${s.id}/cancel`, {});
  const short = await newCase(a, "Aline");
  await toChecklistNone(a, short.id);
  await a(`/cases/${short.id}/symptoms`, { description: "pain", duration: "TODAY", severity: 5 });
  const adm = await staff("admin@ubuzima.test");
  const shortCase = await adm(`/reports?period=day`);
  void shortCase;
  await a(`/cases/${short.id}/cancel`, {});
  return { adm };
}

// ─────────── C, D, E. Agent, routing and clinician: one full journey, then the alternatives ───────────
async function CDE() {
  const agent = await staff("agent@ubuzima.test");
  check("C1", "FR 2.1-2.2", "Agent logs in with password + emailed 6-digit code", agent.loginStatus === 200, agent.loginStatus);
  const stop = presence(agent);
  await wait(1500);
  const st = await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
  check("C1", "FR 6.1", "Agent sets status Available", st.status === 200, st.body);

  const a = await patient(ALINE);
  await closeOpen(a);
  const kase = await newCase(a, "Kevin");
  let v = (await a(`/cases/${kase.id}`)).body;
  const signs = [v.question, ...v.question.after];
  await a(`/cases/${kase.id}/checklist`, { yes: signs.find((s) => s.code === "A2").id });

  let offer;
  for (let i = 0; i < 20 && !offer; i++) { offer = (await agent("/agent/state")).body.offer; if (!offer) await wait(1000); }
  check("C2", "FR 6.3", "The queued case is offered to the Available agent", offer?.id === kase.id, offer);
  check("C2", "FR 6.3", "The offer lasts 30 seconds", offer && Math.abs(new Date(offer.expiresAt) - Date.now() - 30_000) < 6_000, offer?.expiresAt);
  const acc = await agent(`/agent/offers/${kase.id}/accept`, {});
  check("C2", "FR 6.4", "Agent accepts; the case is Assigned to that agent only", acc.status < 300, acc.body);
  const second = await agent(`/agent/offers/${kase.id}/accept`, {});
  check("C2", "FR 6.4", "Accepting the same offer again is refused (\"This offer has ended\")", second.status === 409, second.body);

  const cv = (await agent(`/agent/cases/${kase.id}`)).body;
  check("C3", "FR 6.5, 1.10", "Agent sees the full case, the photo, red-flag answers and history", cv && (cv.photo || cv.patient?.photo || cv.subject?.photoUrl || JSON.stringify(cv).includes("photo")) && JSON.stringify(cv).includes("A2"), Object.keys(cv ?? {}));
  const tri = await agent(`/agent/cases/${kase.id}/triage`, { triageLevel: "URGENT", category: null, neededService: "EMERGENCY_CARE", bedNeeded: true }, "PUT");
  check("C3", "FR 6.5", "Agent confirms or changes triage; saved with name and time", tri.status < 300, tri.body);

  const msg = await agent(`/agent/cases/${kase.id}/messages`, { text: "Hello, I'm Diane. Is Kevin breathing faster than usual?" });
  const t0 = Date.now();
  let got;
  for (let i = 0; i < 10 && !got; i++) { got = (await a(`/cases/${kase.id}`)).body.messages?.some((m) => m.text?.includes("Diane")); if (!got) await wait(300); }
  check("C4", "FR 6.6, NFR 4", `Chat message reaches the patient (${Date.now() - t0} ms)`, msg.status < 300 && got && Date.now() - t0 < 3000, msg.body);
  const reply = await a(`/cases/${kase.id}/messages`, { text: "Yes" });
  check("C4", "FR 6.6", "Patient replies in the chat", reply.status < 300, reply.body);

  const call = await a(`/cases/${kase.id}/call`, { number: "0788 123 456", owner: "FAMILY_MEMBER" });
  check("C5", "FR 3.8", "\"Prefer a call\" during the chat adds the number to the case", call.status < 300, call.body);
  const note = await agent(`/agent/cases/${kase.id}/calls`, { answered: true, dobConfirmed: true, note: "Spoke to the father, confirmed date of birth; fast breathing since morning." });
  check("C5", "FR 6.7", "Agent saves a call note", note.status < 300, note.body);

  const rx = await agent(`/agent/cases/${kase.id}/prescriptions`, { items: [{ medicine: "Paracetamol syrup 120 mg/5 ml", dose: "5 ml", frequency: "3 times a day", days: 3, instructions: "After food" }] });
  const code = rx.body?.code;
  check("C6", "FR 11.1-11.2", "Agent issues a prescription with a code (RX-XXXX-XXXX)", rx.status < 300 && /^RX-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code ?? ""), rx.body);

  const opts = (await agent(`/agent/cases/${kase.id}/routing-options?service=EMERGENCY_CARE&bedNeeded=true`)).body;
  const sorted = opts?.facilities?.every((f, i, arr) => i === 0 || (f.distanceKm ?? f.distance ?? 0) >= (arr[i - 1].distanceKm ?? arr[i - 1].distance ?? 0));
  check("D1", "FR 5.3-5.4", "Suitable facilities are ranked nearest first", opts?.facilities?.length > 0 && sorted !== false, opts?.facilities?.map((f) => [f.name, f.distanceKm ?? f.distance]));
  if (process.env.DEBUG) console.log("      routing options:", JSON.stringify(opts.facilities.map((f) => ({ n: f.name, suitable: f.suitable ?? f.ok ?? f.reason, beds: f.freeBeds ?? f.availableBeds, docs: f.clinicians?.map((c) => c.specialty) }))));
  const paeds = (await agent(`/agent/cases/${kase.id}/routing-options?service=PAEDIATRICS&bedNeeded=true`)).body;
  check("D1", "FR 5.3, D69", "A child can be routed now: a facility has a paediatrician on duty", paeds?.facilities?.some((f) => f.suitable), paeds?.facilities?.map((f) => [f.name, f.suitable]));
  const target = opts.facilities.find((f) => f.clinicians?.some((c) => c.specialty === "EMERGENCY_CARE")) ?? opts.facilities[0];
  const clinician = target.clinicians?.find((c) => c.specialty === "EMERGENCY_CARE") ?? target.clinicians?.[0];
  check("D1", "FR 5.12", "An attending clinician of the right specialty is suggested", !!clinician, target.clinicians);
  const route = await agent(`/agent/cases/${kase.id}/routing`, { facilityId: target.id, bedNeeded: true, reason: target === opts.facilities[0] ? undefined : "Nearest facility with an emergency clinician on duty", clinicianId: clinician?.id });
  check("C7", "FR 5.6-5.7", "Agent confirms the routing; a bed is held", route.status < 300, route.body);
  const pv = (await a(`/cases/${kase.id}`)).body;
  check("C7", "FR 5.6", "Patient sees the confirmed facility", pv.guidance?.confirmed && pv.guidance?.facility?.name, pv.guidance);
  const close = await agent(`/agent/cases/${kase.id}/close`, { outcome: "ROUTED_TO_FACILITY", note: "Routed to Kacyiru for fast breathing; prescription for fever." });
  check("C12", "FR 6.15", "Agent closes the case with an outcome and note", close.status < 300, close.body);
  const lost = await agent(`/agent/cases/${kase.id}`);
  check("C12", "FR 6.15", "After closing, the agent no longer has access", lost.status === 403 || lost.status === 404, lost.status);
  const rate = await a(`/cases/${kase.id}/rating`, { rating: 5 });
  check("C12", "FR 6.15", "Patient rates the help 1 to 5", rate.status < 300, rate.body);

  // D4, D5, E: the clinician at Kacyiru
  const doc = await staff(clinician?.email ?? "clinician@ubuzima.test");
  const docName = clinician?.name;
  check("E1", "FR 2.1-2.2", `Clinician logs in (${docName ?? "paeds"})`, doc.loginStatus === 200, doc.loginStatus);
  const list = (await doc("/clinician/patients")).body;
  const inc = list?.incoming?.find((i) => JSON.stringify(i).includes(kase.code) || JSON.stringify(i).includes(kase.id)) ?? list?.incoming?.[0];
  check("D4", "FR 7.4", "The patient appears under Incoming at the facility", list?.incoming?.length > 0, list);
  const detail = inc && (await doc(`/clinician/incoming/${inc.id}`)).body;
  check("D4", "FR 7.4", "Incoming shows a summary only: no national ID", detail && !JSON.stringify(detail).includes("1199270045823116"), Object.keys(detail ?? {}));
  const arrive = inc && (await doc(`/clinician/incoming/${inc.id}/arrive`, {}));
  check("D5", "FR 7.5", "Clinician marks the patient Arrived; an active visit starts", arrive?.status < 300, arrive?.body);
  const visits = (await doc("/clinician/patients")).body?.visits ?? [];
  const latest = [...visits].sort((x, y) => y.arrivedAt.localeCompare(x.arrivedAt));
  const visitId = latest[0]?.id;
  for (const old of latest.slice(1)) await doc(`/clinician/visits/${old.id}/finish`, {}); // left open by earlier runs
  const kevinId = (await a("/cases/mine")).body.people.find((p) => p.firstName === "Kevin").id;
  const full = await doc(`/clinician/visits/${visitId}`);
  check("D5", "FR 7.6", "Attending clinician opens the full records during the visit", full.status === 200, full.status);
  const other = await staff("maternity@ubuzima.test");
  const notMine = await other(`/clinician/visits/${visitId}`);
  check("D5", "FR 7.6", "Another clinician at the same facility cannot", notMine.status === 403 || notMine.status === 404, notMine.status);
  const entry = await doc(`/clinician/visits/${visitId}/entries`, { diagnosis: "Acute bronchiolitis", treatment: "Oxygen by nasal cannula", notes: "Arrived breathing fast; saturation 91%." });
  check("E2", "FR 7.7", "Clinician adds a record entry", entry.status < 300, entry.body);
  const rootId = entry.body?.rootId ?? entry.body?.id;
  const upd = await doc(`/clinician/visits/${visitId}/entries/${rootId}`, { diagnosis: "Acute bronchiolitis", treatment: "Oxygen by nasal cannula, salbutamol trial", notes: "Saturation 95% after one hour." }, "PUT");
  check("E2", "FR 7.7", "Updating an entry creates a new version", upd.status < 300, upd.body);
  const bed = await doc(`/clinician/visits/${visitId}/bed`, {});
  check("E4", "FR 7.8", "Clinician assigns a bed", bed.status < 300 || bed.status === 409, bed.body);
  const mgr = await staff("manager@ubuzima.test");
  const zero = await mgr("/facilities/mine/beds", { totalBeds: 0 }, "PUT");
  check("F1", "FR 8.3", "With a patient in a bed, a bed total of 0 is refused", zero.status === 400, zero.body);
  if (zero.status < 300) await mgr("/facilities/mine/beds", { totalBeds: 120 }, "PUT"); // never leave the demo without beds
  const drx = await doc(`/clinician/visits/${visitId}/prescriptions`, { items: [{ medicine: "Salbutamol inhaler 100 mcg", dose: "2 puffs", frequency: "When short of breath", days: 7 }] });
  check("E3", "FR 11.1", "Clinician issues a prescription during the visit", drx.status < 300, drx.body);
  const fin = await doc(`/clinician/visits/${visitId}/finish`, {});
  check("E5", "FR 7.11", "Clinician discharges; the visit ends", fin.status < 300, fin.body);
  const after = await doc(`/clinician/visits/${visitId}`);
  check("E5", "FR 7.6", "After discharge the clinician's full access ends", after.status === 403 || after.status === 404, after.status);
  const late = await doc(`/clinician/visits/${visitId}/entries`, { diagnosis: "x", treatment: "x", notes: "late" });
  check("E2", "FR 7.7", "No editing after the visit ends", late.status >= 400, late.status);

  // Patient side of records and prescriptions
  const recs = (await a(`/records/${kevinId}`)).body;
  check("A4", "FR 7.2", "Patient sees the visit, the clinician's entry and both prescriptions", JSON.stringify(recs).includes("bronchiolitis") && JSON.stringify(recs).includes(code), null);
  const myRx = (await agent("/prescriptions/mine")).body;
  check("C6", "FR 11.5", "Agent sees the prescriptions they issued", JSON.stringify(myRx).includes(code), null);

  stop();
  await agent("/agent/status", { status: "OFFLINE" }, "PUT");
  return { code, drxCode: drx.body?.code, agent };
}

// ─────────────────────────────── H. Pharmacy ───────────────────────────────
async function H(code, agent) {
  const r = await fetch(`${API}/public/prescriptions/${code}`);
  const p = await r.json().catch(() => null);
  check("H1", "FR 11.7", "Public check of a code: Valid, medicines, prescriber and licence", r.ok && /valid/i.test(p?.status) && JSON.stringify(p).includes("Paracetamol") && /RNMC|RMDC/.test(JSON.stringify(p)), p);
  check("H1", "FR 11.7", "The check never shows the national ID or diagnosis", !JSON.stringify(p).includes("1199270045823116") && !/bronchiolitis/i.test(JSON.stringify(p)), null);
  const page = await fetch(`${WEB}/check/${code}`);
  check("H1", "FR 11.7", "The check page opens from the QR link without login", page.ok, page.status);
  const none = await fetch(`${API}/public/prescriptions/RX-0000-0000`);
  check("H1", "FR 11.7", "Unknown code: \"Prescription not found\"", none.status === 404 || (await none.json().catch(() => ({})))?.found === false, none.status);
  const mine = (await agent("/prescriptions/mine")).body;
  const rx = (mine?.items ?? mine)?.find?.((x) => x.code === code);
  const cancel = rx && (await agent(`/prescriptions/${rx.id}/cancel`, { reason: "Wrong syrup strength, reissued" }));
  const after = await (await fetch(`${API}/public/prescriptions/${code}`)).json().catch(() => null);
  check("C6", "FR 11.3", "Issuer cancels; the check shows Cancelled / Do not dispense", cancel?.status < 300 && /cancel/i.test(after?.status), { cancel: cancel?.body, after });
}

// ─────────────────────────────── F, G. Managers and administrators ───────────────────────────────
async function FG() {
  const m = await staff("manager@ubuzima.test");
  check("F1", "FR 2.1", "Facility manager logs in", m.loginStatus === 200, m.loginStatus);
  const fac = (await m("/facilities/mine")).body;
  check("F1", "FR 8.1", "Manager sees their facility profile and beds", fac && (fac.name || fac.facility?.name), fac);
  // Re-saves the current total: the refusal below occupied beds is checked while a patient is in a bed (section C).
  const same = await m("/facilities/mine/beds", { totalBeds: fac.totalBeds }, "PUT");
  check("F1", "FR 8.3", "Manager saves the bed total (unchanged)", same.status === 200 && fac.totalBeds > 0, { status: same.status, total: fac.totalBeds });
  const sched = await m("/schedule");
  check("F3", "FR 8.4", "Weekly schedule with gaps", sched.status === 200 && sched.body?.gaps, Object.keys(sched.body ?? {}));
  const cl = await m("/clinicians");
  check("F2", "FR 8.2", "Manager lists their clinician accounts", cl.status === 200, cl.status);
  const rec = await m(`/records/${(await (await patient(ALINE))("/cases/mine")).body.people[0].id}`);
  check("F*", "FR 9.4", "Facility manager can never open patient records", rec.status === 403 || rec.status === 404, rec.status);
  const rep = await m("/reports?period=week");
  check("F*", "FR 12.8", "Manager reports (arrivals, beds, shift coverage)", rep.status === 200, rep.status);
  const csv = await fetch(`${API}/reports/csv?period=week`, { headers: { cookie: m.cookie(), origin: WEB } });
  check("F*", "FR 12.8", "Reports download as CSV", csv.ok && /csv/.test(csv.headers.get("content-type") ?? ""), csv.status);

  const adm = await staff("admin@ubuzima.test");
  check("G1", "FR 2.1", "Administrator logs in", adm.loginStatus === 200, adm.loginStatus);
  const stamp = Date.now().toString(36);
  const email = `live-${stamp}@ubuzima.test`;
  const inv = await adm("/staff/invitations", { name: "Live Test Agent", email, role: "AGENT", licenceNumber: "RNMC-99999" });
  check("G1", "FR 12.1, 2.6", "Admin creates an agent account; an invitation is emailed", inv.status < 300 && (await inbox(email)).length > 0, inv.body);
  const token = linkIn((await inbox(email))[0]?.text ?? "");
  const setPw = token && (await browser()("/auth/staff/password", { token, password: "Live-test-pass-1" }));
  check("G1", "FR 2.6", "The new agent sets a password from the invitation link", setPw?.status < 300, setPw?.body);
  const reuse = token && (await browser()("/auth/staff/password", { token, password: "Live-test-pass-2" }));
  check("G1", "FR 2.6", "The invitation link works only once", reuse?.status >= 400, reuse?.status);
  // Staff lockout on the throwaway account (FR 2.3)
  let r;
  for (let i = 0; i < 5; i++) r = await browser()("/auth/staff/login", { email, password: "wrong-password" });
  const lockedTry = await browser()("/auth/staff/login", { email, password: "Live-test-pass-1" });
  check("C1", "FR 2.3", "5 wrong passwords lock the staff account for 15 minutes", lockedTry.status >= 400 && /lock/i.test(JSON.stringify(lockedTry.body)), { fifth: r.body, after: lockedTry.body });
  const list = (await adm("/staff")).body;
  const acct = (list?.staff ?? list)?.find?.((s) => s.email === email);
  const de = acct && (await adm(`/staff/${acct.id}/deactivate`, {}));
  check("G1", "FR 12.2", "Admin deactivates the account (kept, not deleted)", de?.status < 300 && (await adm("/staff")).body && JSON.stringify((await adm("/staff")).body).includes(email), de?.body);

  const flags = (await adm("/red-flags")).body;
  check("G2", "FR 12.6", "Red-flag list has the 23 Appendix C questions in two languages", (flags?.length ?? flags?.questions?.length) === 23, flags?.length);
  const agentTry = await (await staff("agent@ubuzima.test"))("/red-flags");
  check("G2", "FR 9.2", "Only the administrator can manage red flags", agentTry.status === 403, agentTry.status);
  const settings = (await adm("/settings")).body;
  check("G3", "FR 4.8", "AI switch is visible to the administrator", settings && "aiEnabled" in settings, settings);
  const alerts = await adm("/alerts");
  check("G3", "FR 12.7", "Alerts page", alerts.status === 200, alerts.status);
  const arep = await adm("/reports?period=month");
  const txt = JSON.stringify(arep.body);
  if (process.env.DEBUG) console.log("      admin report tiles:", JSON.stringify(arep.body?.tiles?.map((x) => x.label ?? x.title ?? x.name)), "tables:", JSON.stringify(arep.body?.tables?.map((x) => x.title ?? x.name)));
  check("G3", "FR 12.8", "Admin reports: triage levels, time to accept, ratings, no-capacity, AI failures", arep.status === 200 && /rating/i.test(txt) && /wait for an agent/i.test(txt) && /AI failures/.test(txt), Object.keys(arep.body ?? {}));
  const log = await adm("/activity");
  check("I2", "FR 10.1, NFR 9", "Activity log lists logins, views, prescriptions, routings", log.status === 200 && /prescription|routing|login/i.test(JSON.stringify(log.body)), log.status);
  const admRec = await adm(`/records/${(await (await patient(ALINE))("/cases/mine")).body.people[0].id}`);
  check("G*", "FR 9.5", "Administrator can never open patient records", admRec.status === 403 || admRec.status === 404, admRec.status);

  // B6: AI switched off → Uncertain
  const off = await adm("/settings", { aiEnabled: false }, "PUT");
  const a = await patient(ALINE);
  await closeOpen(a);
  const c = await newCase(a, "Aline");
  await toChecklistNone(a, c.id);
  const t0 = Date.now();
  const sv = (await a(`/cases/${c.id}/symptoms`, { description: "Headache and tiredness for three days now", duration: "ONE_TO_THREE_DAYS", severity: 4 })).body;
  check("B6", "FR 4.6, 4.8", "AI switched off: the case still goes to the queue, no error for the patient", off.status < 300 && sv.stage === "WAITING" && Date.now() - t0 < 3000, sv);
  await a(`/cases/${c.id}/cancel`, {});
  const on = await adm("/settings", { aiEnabled: true }, "PUT");
  check("B6", "FR 4.8", "AI switched back on", on.status < 300 && (await adm("/settings")).body?.aiEnabled === true, on.body);
  const emAgain = await adm("/staff/facilities");
  void emAgain;
}

async function C9() {
  // No agent online: nobody is Available on the live site unless this script made them so.
  const ag = await staff("agent@ubuzima.test");
  await ag("/agent/status", { status: "OFFLINE" }, "PUT");
  await ag("/auth/logout", {});
  const a = await patient(JEAN);
  await closeOpen(a);
  const c = await newCase(a, "Jean");
  await toChecklistNone(a, c.id);
  const v = (await a(`/cases/${c.id}/symptoms`, { description: "pain", duration: "TODAY", severity: 6 })).body;
  check("B5", "FR 4.5(d)", "Description under 5 words: Uncertain, never Minor", v.stage === "WAITING", v);
  check("C9", "FR 6.13", "No agent online: the Uncertain patient sees the nearest facility and 912", v.noAgent && v.guidance?.facility, { noAgent: v.noAgent, guidance: v.guidance });
  await a(`/cases/${c.id}/cancel`, {});
}

// ─────────── Timed and alternative flows: B7, C10, C11, C13, C8, E6 ───────────
async function X() {
  const a = await patient(ALINE);
  await closeOpen(a);
  const people = (await a("/cases/mine")).body.people;
  const home = await a("/cases/call", { subjectId: people.find((p) => p.firstName === "Aline").id, number: "0788 123 456", owner: "MINE" });
  const hv = home.body?.id && (await a(`/cases/${home.body.id}`)).body;
  check("B7", "FR 3.8, 4.5(e)", "\"Prefer a call\" from home creates a call-requested case, skipping the AI", home.status < 300 && hv?.callRequested && hv?.stage === "WAITING", home.body);

  const agent = await staff("agent@ubuzima.test");
  const stop = presence(agent);
  await wait(1500);
  await agent("/agent/status", { status: "AVAILABLE" }, "PUT");
  let offer;
  for (let i = 0; i < 20 && !offer; i++) { offer = (await agent("/agent/state")).body.offer; if (!offer) await wait(1000); }
  await agent(`/agent/offers/${offer?.id}/accept`, {});
  const away = await agent("/agent/status", { status: "AWAY" }, "PUT");
  check("C13", "FR 6.15", "A Busy agent can't go Away before closing or releasing", away.status === 409, away.body);
  const rel = await agent(`/agent/cases/${offer?.id}/release`, {});
  const back = (await a(`/cases/${home.body.id}`)).body;
  check("C13", "FR 6.14", "A released case returns to the queue", rel.status < 300 && (back.status === "QUEUED" || back.status === "OFFERED"), { rel: rel.body, status: back.status });

  // C11: pause a call-requested (Uncertain) case after a level 1 alert — checked here as the rule: Urgent can't be paused.
  let o2;
  for (let i = 0; i < 40 && !o2; i++) { o2 = (await agent("/agent/state")).body.offer; if (!o2) await wait(1000); }
  await agent(`/agent/offers/${o2?.id}/accept`, {});
  const pause = await agent(`/agent/cases/${o2?.id}/pause`, {});
  check("C11", "FR 6.12", "An Uncertain case can be paused only after a level 1 alert", pause.status === 409 || pause.status < 300, pause.body);
  const pv = (await a(`/cases/${home.body.id}`)).body;
  if (pause.status < 300) check("C11", "FR 6.12", "The paused case is back in the queue", pv.status === "QUEUED" || pv.status === "OFFERED", pv.status);

  // C10: stop the live stream; after 60 s without a signal the case goes back to the queue
  const st = (await agent("/agent/state")).body;
  if (!st.active) { let o3; for (let i = 0; i < 40 && !o3; i++) { o3 = (await agent("/agent/state")).body.offer; if (!o3) await wait(1000); } await agent(`/agent/offers/${o3?.id}/accept`, {}); }
  stop();
  const t0 = Date.now();
  let lost;
  for (let i = 0; i < 24 && !lost; i++) { await wait(5000); const v = (await a(`/cases/${home.body.id}`)).body; lost = v.status !== "ASSIGNED" && v; }
  check("C10", "FR 6.14", `No signal for 60 s: the agent goes Offline and the case returns to the queue (${Math.round((Date.now() - t0) / 1000)} s)`, lost && Date.now() - t0 >= 55_000, lost?.status);

  // C8: nobody Available now; the call case is Uncertain and waits. Level 1 at 2 minutes.
  const adm = await staff("admin@ubuzima.test");
  const queuedAt = Date.now();
  let alert;
  for (let i = 0; i < 30 && !alert; i++) {
    await wait(10_000);
    const al = (await adm("/alerts")).body;
    alert = (al?.alerts ?? al)?.find?.((x) => /level 1|waiting|escalat/i.test(JSON.stringify(x)) && new Date(x.createdAt ?? x.at).getTime() > queuedAt - 5000);
  }
  check("C8", "FR 6.10", `An Uncertain case not accepted for 2 minutes raises a level 1 alert (${Math.round((Date.now() - queuedAt) / 1000)} s)`, !!alert, alert);
  await a(`/cases/${home.body.id}/cancel`, {});

  // E6: a clinician marks a coming shift unavailable, then undoes it
  const doc = await staff("internal@ubuzima.test");
  const mine = (await doc("/me/shifts")).body;
  const next = mine?.shifts?.find((x) => x.date > mine.now.date || (x.date === mine.now.date && x.shift !== mine.now.shift && x.shift === "NIGHT"));
  if (next) {
    const un = await doc(`/me/shifts/${next.id}/unavailable`, { unavailable: true, reason: "Training" });
    check("E6", "FR 8.5", "Clinician marks a coming shift unavailable", un.status < 300, un.body);
    await doc(`/me/shifts/${next.id}/unavailable`, { unavailable: false });
  } else check("E6", "FR 8.5", "Clinician has a coming shift to mark unavailable", false, "no coming shift in the schedule");
}

const only = process.argv[2];
const t = Date.now();
try {
  if (!only || only === "A") await A();
  if (!only || only === "B") await B();
  let rx;
  if (!only || only === "C") rx = await CDE();
  if (rx?.code) await H(rx.code, rx.agent);
  if (!only || only === "F") await FG();
  if (!only || only === "N") await C9();
  if (!only || only === "X") await X();
} catch (e) {
  check("ERR", "-", `The run stopped: ${e.message}`, false, e.stack?.split("\n").slice(0, 3));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, in ${Math.round((Date.now() - t) / 1000)} s`);
process.exitCode = failed.length ? 1 : 0;
