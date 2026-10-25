#!/usr/bin/env node
// Keeps the live demo staffed (DECISIONS.md D69). The seed only filled the week it ran in, with one clinician per
// specialty, so from the next Monday no facility had anyone on duty and routing found nowhere to send patients.
// This does what the managers and the administrator would do in the app, through the same API:
//   - Kacyiru's manager adds a partner for each specialty, so every specialty there is covered Day and Night;
//   - the administrator creates a manager for Remera Health Centre;
//   - each manager fills their clinicians' shifts, and the administrator the agents', for the coming weeks.
// Kibagabaga and Remera keep their gaps (Kibagabaga's emergency care at night, Remera at night), so the coverage
// view and the shift-gap report still have something to show. Safe to run again: it only adds what is missing.
//
//   node scripts/demo-schedule.mjs [weeks=12]
import { readFileSync } from "node:fs";

const API = process.env.API ?? "https://api.ubuzima.wilsonn.tech";
const WEB = process.env.WEB ?? "https://ubuzima.wilsonn.tech";
const WEEKS = Number(process.argv[2] ?? 12);
const PASSWORD = readFileSync(new URL("../apps/api/src/seed.ts", import.meta.url), "utf8").match(/DEV_PASSWORD = [^"]*"([^"]+)"/)[1];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function browser() {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  return async (path, body, method) => {
    let res;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(API + path, {
          method: method ?? (body === undefined ? "GET" : "POST"),
          headers: { "content-type": "application/json", cookie: cookie(), origin: WEB },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        break;
      } catch (e) {
        if (attempt === 5) throw e; // a dropped connection: the request is safe to repeat
        await wait(1000 * attempt);
      }
    }
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      jar.set(kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1));
    }
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}
const inbox = async (to) => (await (await fetch(`${API}/demo/inbox`)).json()).filter((m) => m.to === to);
async function staff(email) {
  const b = browser();
  const before = (await inbox(email))[0]?.id;
  await b("/auth/staff/login", { email, password: PASSWORD });
  for (let i = 0; i < 20; i++) {
    const m = (await inbox(email))[0];
    if (m && m.id !== before) {
      await b("/auth/staff/code", { code: (m.subject + " " + m.text).match(/(\d{3}) (\d{3})/).slice(1).join("") });
      return b;
    }
    await wait(500);
  }
  throw new Error(`No login code for ${email}`);
}
/** Accepts an invitation the way the new staff member would: the link in the email, then a password. */
async function accept(email) {
  for (let i = 0; i < 20; i++) {
    const token = (await inbox(email))[0]?.text.match(/\/staff\/invitation\/([\w-]+)/)?.[1];
    if (token) return (await browser()("/auth/staff/password", { token, password: PASSWORD })).status;
    await wait(500);
  }
  return 0;
}

const PARTNERS = [
  // Kacyiru: the seeded clinician of each specialty works one shift; the partner takes the other.
  { name: "Dr. Alice Mukarwego", email: "er.night@ubuzima.test", specialty: "EMERGENCY_CARE", licenceNumber: "RMDC-07114" },
  { name: "Dr. Fabrice Nshimiyimana", email: "paeds.day@ubuzima.test", specialty: "PAEDIATRICS", licenceNumber: "RMDC-07208" },
  { name: "Agnes Nyirahabimana", email: "maternity.night@ubuzima.test", specialty: "MATERNITY", licenceNumber: "RNMC-23561" },
  { name: "Dr. Thierry Bizimana", email: "surgery.day@ubuzima.test", specialty: "SURGERY", licenceNumber: "RMDC-07355" },
  { name: "Dr. Chantal Uwineza", email: "gp.night@ubuzima.test", specialty: "GENERAL_MEDICINE", licenceNumber: "RMDC-07419" },
  { name: "Dr. Didier Hakizimana", email: "internal.day@ubuzima.test", specialty: "INTERNAL_MEDICINE", licenceNumber: "RMDC-07502" },
];
const DAY_ONLY = new Set(["clinician@ubuzima.test", "maternity@ubuzima.test", "gp@ubuzima.test", "kib.er@ubuzima.test", "remera@ubuzima.test", "agent@ubuzima.test", "paeds.day@ubuzima.test", "surgery.day@ubuzima.test", "internal.day@ubuzima.test"]);

const iso = (d) => d.toISOString().slice(0, 10);
function days() {
  // Kigali is UTC+2; shifts run 07:00–19:00 and 19:00–07:00 local time, dated by the day they start.
  const now = new Date(Date.now() + 2 * 3600_000);
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  return Array.from({ length: WEEKS * 7 }, (_, i) => iso(new Date(monday.getTime() + i * 86_400_000)));
}

async function fill(b, people, label) {
  const dates = days();
  const week = await b(`/schedule`);
  const have = new Set((week.body?.assignments ?? []).map((a) => `${a.staffId}|${a.date.slice(0, 10)}|${a.shift}`));
  let added = 0;
  for (const p of people) {
    const shift = DAY_ONLY.has(p.email) ? "DAY" : "NIGHT";
    for (const date of dates) {
      if (have.has(`${p.id}|${date}|${shift}`)) continue;
      const r = await b("/schedule", { staffId: p.id, date, shift, assigned: true }, "PUT");
      if (r.status >= 300) throw new Error(`${label}: ${p.email} ${date} ${shift} → ${JSON.stringify(r.body)}`);
      added++;
    }
  }
  console.log(`${label}: ${people.length} people, ${added} shifts added (${dates[0]} to ${dates.at(-1)})`);
}

const admin = await staff("admin@ubuzima.test");
const kacyiru = await staff("manager@ubuzima.test");

const known = new Set((((await kacyiru("/clinicians")).body?.clinicians ?? (await kacyiru("/clinicians")).body) || []).map((c) => c.email));
for (const p of PARTNERS) {
  if (known.has(p.email)) continue;
  const r = await kacyiru("/clinicians", p);
  console.log(`Kacyiru adds ${p.name} (${p.specialty}): ${r.status}, invitation accepted: ${await accept(p.email)}`);
}

const facilities = (await admin("/staff/facilities")).body;
const remera = (facilities?.facilities ?? facilities).find((f) => /Remera/.test(f.name));
const staffList = (await admin("/staff")).body;
const all = staffList?.staff ?? staffList;
if (!all.some((s) => s.email === "manager3@ubuzima.test")) {
  const r = await admin("/staff/invitations", { name: "Jeanne Uwamariya", email: "manager3@ubuzima.test", role: "FACILITY_MANAGER", facilityId: remera.id });
  console.log(`Remera manager invited: ${r.status}, invitation accepted: ${await accept("manager3@ubuzima.test")}`);
}

const clinicians = async (b) => {
  const r = (await b("/clinicians")).body;
  return (r?.clinicians ?? r).filter((c) => c.status !== "DEACTIVATED");
};
await fill(kacyiru, await clinicians(kacyiru), "Kacyiru District Hospital");
await fill(await staff("manager2@ubuzima.test"), await clinicians(await staff("manager2@ubuzima.test")), "Kibagabaga Hospital");
const m3 = await staff("manager3@ubuzima.test");
await fill(m3, await clinicians(m3), "Remera Health Centre");
const agents = ((await admin("/staff")).body?.staff ?? (await admin("/staff")).body).filter((s) => s.role === "AGENT" && s.status === "ACTIVE" && /^agent2?@/.test(s.email));
await fill(admin, agents, "Agents");
