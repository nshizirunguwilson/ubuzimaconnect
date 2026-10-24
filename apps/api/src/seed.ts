/**
 * Development and demo data. Run: pnpm --filter @ubuzima/api seed. Safe to run again (upserts).
 * - Facilities: real Kigali facility names; services, beds and coordinates are approximate demo values.
 * - Staff: fictional people, one or more per role, all with the demo password below.
 * - This week's schedule for agents and clinicians, so routing has people on duty.
 * - The red-flag list from SRS Appendix C (English; Kinyarwanda is added by the administrator).
 * Patients are not seeded: they are created from the mock NIDA on first login.
 */
import { createDb, type FacilityLevel, type RedFlagGroup, type Service, type StaffRole } from "@ubuzima/db";
import { currentShift, provinceOf, weekDays, weekStart } from "@ubuzima/shared";
import { hashPassword } from "./common/crypto";

/** Test-only password for the seeded accounts. Never used in production. */
const DEV_PASSWORD = process.env.SEED_PASSWORD ?? "Ubuzima-demo-2026";

const ALL: Service[] = ["EMERGENCY_CARE", "GENERAL_MEDICINE", "INTERNAL_MEDICINE", "PAEDIATRICS", "MATERNITY", "SURGERY", "MENTAL_HEALTH"];

type F = { name: string; level: FacilityLevel; district: string; sector: string; lat: number; lng: number; beds: number; services: Service[]; phone?: string };
const facilities: F[] = [
  { name: "Kacyiru District Hospital", level: "DISTRICT_HOSPITAL", district: "Gasabo", sector: "Kacyiru", lat: -1.9368, lng: 30.0846, beds: 120, services: ALL.filter((s) => s !== "MENTAL_HEALTH"), phone: "0788 300 101" },
  { name: "Kibagabaga Level Two Teaching Hospital", level: "PROVINCIAL_HOSPITAL", district: "Gasabo", sector: "Kimironko", lat: -1.9306, lng: 30.1139, beds: 200, services: ALL, phone: "0788 300 102" },
  { name: "Remera Health Centre", level: "HEALTH_CENTRE", district: "Gasabo", sector: "Remera", lat: -1.9549, lng: 30.1082, beds: 10, services: ["GENERAL_MEDICINE", "PAEDIATRICS", "MATERNITY"], phone: "0788 300 103" },
  { name: "University Teaching Hospital of Kigali", level: "REFERRAL_HOSPITAL", district: "Nyarugenge", sector: "Nyarugenge", lat: -1.9447, lng: 30.0611, beds: 500, services: ALL, phone: "0788 300 104" },
  { name: "Masaka District Hospital", level: "DISTRICT_HOSPITAL", district: "Kicukiro", sector: "Masaka", lat: -1.9905, lng: 30.1875, beds: 100, services: ["EMERGENCY_CARE", "GENERAL_MEDICINE", "PAEDIATRICS", "MATERNITY", "SURGERY"], phone: "0788 300 105" },
  { name: "Ndera Neuropsychiatric Hospital", level: "REFERRAL_HOSPITAL", district: "Gasabo", sector: "Ndera", lat: -1.9443, lng: 30.1625, beds: 300, services: ["MENTAL_HEALTH", "GENERAL_MEDICINE"], phone: "0788 300 106" },
];

type S = { email: string; name: string; role: StaffRole; facility?: number; licence?: string; specialty?: Service };
const staff: S[] = [
  { email: "admin@ubuzima.test", name: "Patrick Nkurunziza", role: "ADMIN" },
  { email: "agent@ubuzima.test", name: "Diane Umutoni", role: "AGENT", licence: "RNMC-22817" },
  { email: "agent2@ubuzima.test", name: "Eric Habineza", role: "AGENT", licence: "RNMC-30455" },
  { email: "manager@ubuzima.test", name: "Olivier Rukundo", role: "FACILITY_MANAGER", facility: 0 },
  { email: "manager2@ubuzima.test", name: "Grace Mukandori", role: "FACILITY_MANAGER", facility: 1 },
  { email: "clinician@ubuzima.test", name: "Dr. Samuel Mugisha", role: "CLINICIAN", facility: 0, licence: "RMDC-04521", specialty: "EMERGENCY_CARE" },
  { email: "paeds@ubuzima.test", name: "Dr. Claudine Ingabire", role: "CLINICIAN", facility: 0, licence: "RMDC-05102", specialty: "PAEDIATRICS" },
  { email: "maternity@ubuzima.test", name: "Marie Uwera", role: "CLINICIAN", facility: 0, licence: "RNMC-17734", specialty: "MATERNITY" },
  { email: "surgery@ubuzima.test", name: "Dr. Jean Bosco Nsengimana", role: "CLINICIAN", facility: 0, licence: "RMDC-03998", specialty: "SURGERY" },
  { email: "gp@ubuzima.test", name: "Dr. Yvette Uwamahoro", role: "CLINICIAN", facility: 0, licence: "RMDC-06231", specialty: "GENERAL_MEDICINE" },
  { email: "internal@ubuzima.test", name: "Dr. Emmanuel Kayitare", role: "CLINICIAN", facility: 0, licence: "RMDC-04877", specialty: "INTERNAL_MEDICINE" },
  { email: "kib.er@ubuzima.test", name: "Dr. Aimable Ndayisaba", role: "CLINICIAN", facility: 1, licence: "RMDC-05560", specialty: "EMERGENCY_CARE" },
  { email: "kib.mh@ubuzima.test", name: "Dr. Solange Uwase", role: "CLINICIAN", facility: 1, licence: "RMDC-06012", specialty: "MENTAL_HEALTH" },
  { email: "remera@ubuzima.test", name: "Josiane Mukeshimana", role: "CLINICIAN", facility: 2, licence: "RNMC-21190", specialty: "GENERAL_MEDICINE" },
];

/** SRS Appendix C. N2 (babies under 8 days) is a rule in code (FR 4.2), not a question. */
const redFlags: { code: string; group: RedFlagGroup; textEn: string; service: Service; source: string }[] = [
  { code: "A1", group: "A", textEn: "Is the sick person unconscious or not responding when you speak to them or touch them?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b); WHO (2005)" },
  { code: "A2", group: "A", textEn: "Is the sick person struggling to breathe, breathing very fast or with a noisy sound, or are their lips or tongue turning blue?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b); WHO (2005)" },
  { code: "A3", group: "A", textEn: "Is the sick person having a fit (convulsion) right now, or did they just have one?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b); WHO (2005); PAHO & WHO (2005)" },
  { code: "A4", group: "A", textEn: "Is there heavy bleeding that does not stop?", service: "SURGERY", source: "WHO (n.d.-b)" },
  { code: "A5", group: "A", textEn: "Is there sudden swelling of the mouth, tongue, throat or neck?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b)" },
  { code: "A6", group: "A", textEn: "Has the sick person swallowed poison, a chemical, or too much medicine?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b); WHO (2005)" },
  { code: "A7", group: "A", textEn: "Was the sick person bitten by a snake?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b)" },
  { code: "A8", group: "A", textEn: "Did the sick person have a serious injury (road accident, fall from a height, deep wound, or a bone coming through the skin)?", service: "SURGERY", source: "WHO (n.d.-b)" },
  { code: "A9", group: "A", textEn: "Does the sick person have a large or deep burn, or a burn on the face, hands or private parts?", service: "SURGERY", source: "WHO (n.d.-b); WHO (2005)" },
  { code: "A10", group: "A", textEn: "Is the sick person very confused or very hard to wake, together with fever, a stiff neck or a bad headache?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b)" },
  { code: "A11", group: "A", textEn: "Did any of these start suddenly: face drooping on one side, weakness of an arm or leg on one side, difficulty speaking, loss of balance, or loss of vision?", service: "EMERGENCY_CARE", source: "WHO (n.d.-b); Weill Cornell Medicine (n.d.)" },
  { code: "A12", group: "A", textEn: "Does the sick person have sudden chest pain or pressure?", service: "INTERNAL_MEDICINE", source: "WHO (n.d.-b)" },
  { code: "A13", group: "A", textEn: "Is the sick person thinking about ending their life or harming themselves right now, or have they just tried?", service: "MENTAL_HEALTH", source: "WHO (n.d.-a)" },
  { code: "C1", group: "C", textEn: "Is the child unable to drink or breastfeed at all?", service: "PAEDIATRICS", source: "WHO (n.d.-b); PAHO & WHO (2005)" },
  { code: "C2", group: "C", textEn: "Is the child vomiting everything they eat or drink?", service: "PAEDIATRICS", source: "PAHO & WHO (2005)" },
  { code: "C3", group: "C", textEn: "Is the child very sleepy, floppy, or very hard to wake?", service: "PAEDIATRICS", source: "WHO (2005); PAHO & WHO (2005)" },
  { code: "C4", group: "C", textEn: "Does the child have diarrhoea together with sunken eyes, very weak, or drinking very little?", service: "PAEDIATRICS", source: "WHO (n.d.-b); WHO (2005)" },
  { code: "C5", group: "C", textEn: "Are the child’s hands and feet cold, and is the child very weak?", service: "PAEDIATRICS", source: "WHO (n.d.-b); WHO (2005)" },
  { code: "N1", group: "N", textEn: "Is the baby (under 2 months) hot with fever, or unusually cold to the touch?", service: "PAEDIATRICS", source: "WHO (n.d.-b); WHO (2005)" },
  { code: "P1", group: "P", textEn: "Is there any bleeding from the vagina?", service: "MATERNITY", source: "WHO (2013)" },
  { code: "P2", group: "P", textEn: "Is there a severe headache together with blurred vision?", service: "MATERNITY", source: "WHO (2013)" },
  { code: "P3", group: "P", textEn: "Is there a fever and is she too weak to get out of bed?", service: "MATERNITY", source: "WHO (2013)" },
  { code: "P4", group: "P", textEn: "Is there severe pain in the belly?", service: "MATERNITY", source: "WHO (2013)" },
];

/** NFR 7: Kinyarwanda DRAFTS of the red-flag questions, to be checked by a Kinyarwanda speaker (docs/translations). */
const redFlagsRw: Record<string, string> = {
  A1: "Umurwayi yataye ubwenge cyangwa ntasubiza iyo umuvugishije cyangwa umukozeho?",
  A2: "Umurwayi arahumeka bimugoye, arahumeka vuba cyane cyangwa asakuza, cyangwa iminwa cyangwa ururimi biri guhinduka ubururu?",
  A3: "Umurwayi ari kugagara (igicuri) ubu, cyangwa amaze kugagara?",
  A4: "Hari kuva amaraso menshi adahagarara?",
  A5: "Hari ukubyimba gutunguranye kw'akanwa, ururimi, umuhogo cyangwa ijosi?",
  A6: "Umurwayi yamize uburozi, imiti y'ubutabire, cyangwa imiti irenze urugero?",
  A7: "Umurwayi yarumwe n'inzoka?",
  A8: "Umurwayi yakomeretse bikomeye (impanuka yo mu muhanda, kugwa ahantu harehare, igikomere kinini, cyangwa igufwa ryasohotse mu ruhu)?",
  A9: "Umurwayi afite ubushye bunini cyangwa bwinjiye cyane, cyangwa ubushye mu maso, ku biganza cyangwa ku myanya ndangagitsina?",
  A10: "Umurwayi ari kuvangirwa cyane cyangwa birakomeye kumukangura, kandi afite umuriro, ijosi rikakaye cyangwa umutwe urya cyane?",
  A11: "Hari kimwe muri ibi cyatangiye gitunguranye: igice kimwe cy'isura kirebuka, intege nke z'ukuboko cyangwa ukuguru ku ruhande rumwe, kuvuga bigoranye, gutakaza uburinganire, cyangwa kutabona?",
  A12: "Umurwayi afite ububabare cyangwa kuremererwa mu gatuza bitunguranye?",
  A13: "Umurwayi ari gutekereza kwiyahura cyangwa kwigirira nabi ubu, cyangwa amaze kubigerageza?",
  C1: "Umwana ntashobora na gato kunywa cyangwa konka?",
  C2: "Umwana aruka ibyo arya n'ibyo anywa byose?",
  C3: "Umwana arasinzira cyane, yacitse intege cyane, cyangwa birakomeye kumukangura?",
  C4: "Umwana arahitwa kandi amaso yarinjiye, afite intege nke cyane, cyangwa anywa bike cyane?",
  C5: "Ibiganza n'ibirenge by'umwana birakonje, kandi umwana afite intege nke cyane?",
  N1: "Uruhinja (ruri munsi y'amezi 2) rufite umuriro, cyangwa rurakonje bidasanzwe iyo urukozeho?",
  P1: "Hari amaraso ava mu gitsina?",
  P2: "Hari umutwe urya cyane hamwe no kutabona neza?",
  P3: "Afite umuriro kandi afite intege nke cyane ku buryo adashobora kuva mu buriri?",
  P4: "Hari ububabare bukabije mu nda?",
};

async function main() {
  const db = createDb();

  const ids: string[] = [];
  for (const f of facilities) {
    const data = {
      level: f.level,
      services: f.services,
      province: provinceOf(f.district)!,
      district: f.district,
      sector: f.sector,
      latitude: f.lat,
      longitude: f.lng,
      totalBeds: f.beds,
      phone: f.phone ?? null,
    };
    const existing = await db.facility.findFirst({ where: { name: f.name } });
    ids.push((existing ? await db.facility.update({ where: { id: existing.id }, data }) : await db.facility.create({ data: { name: f.name, ...data } })).id);
  }

  const passwordHash = await hashPassword(DEV_PASSWORD);
  const staffIds: { id: string; role: StaffRole }[] = [];
  for (const s of staff) {
    const data = {
      name: s.name,
      role: s.role,
      status: "ACTIVE" as const,
      passwordHash,
      facilityId: s.facility === undefined ? null : ids[s.facility],
      licenceNumber: s.licence ?? null,
      specialty: s.specialty ?? null,
    };
    const row = await db.staff.upsert({ where: { email: s.email }, create: { email: s.email, ...data }, update: data });
    staffIds.push({ id: row.id, role: row.role });
  }

  // This week: agents cover Day and Night; clinicians alternate so the coverage view has real gaps.
  const admin = staffIds[0].id;
  const days = weekDays(weekStart(currentShift().date));
  const agents = staffIds.filter((s) => s.role === "AGENT");
  const clinicians = staffIds.filter((s) => s.role === "CLINICIAN");
  const plan: { staffId: string; shift: "DAY" | "NIGHT" }[] = [
    ...agents.map((a, i) => ({ staffId: a.id, shift: (i % 2 === 0 ? "DAY" : "NIGHT") as "DAY" | "NIGHT" })),
    ...clinicians.map((c, i) => ({ staffId: c.id, shift: (i % 2 === 0 ? "DAY" : "NIGHT") as "DAY" | "NIGHT" })),
  ];
  for (const date of days) {
    for (const p of plan) {
      const d = new Date(`${date}T00:00:00Z`);
      await db.shiftAssignment.upsert({
        where: { staffId_date_shift: { staffId: p.staffId, date: d, shift: p.shift } },
        create: { staffId: p.staffId, date: d, shift: p.shift, createdById: admin },
        update: {},
      });
    }
  }

  for (const [i, q] of redFlags.entries()) {
    await db.redFlagQuestion.upsert({
      where: { code: q.code },
      create: { ...q, textRw: redFlagsRw[q.code], sortOrder: i + 1 },
      update: {},
    });
    // Fills the Kinyarwanda draft only where none was written yet; an administrator's text is kept.
    await db.redFlagQuestion.updateMany({ where: { code: q.code, textRw: null }, data: { textRw: redFlagsRw[q.code] } });
  }

  await db.systemSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  console.log(`Seeded ${facilities.length} facilities, ${staff.length} staff, ${days.length * plan.length} shifts and ${redFlags.length} red-flag questions.`);
  await db.$disconnect();
}

void main();
