import { z } from "zod";

/** Glossary "Service" and FR 5.1: the fixed list of care types, also a clinician's specialty. */
export const SERVICES = [
  "EMERGENCY_CARE",
  "GENERAL_MEDICINE",
  "INTERNAL_MEDICINE",
  "PAEDIATRICS",
  "MATERNITY",
  "SURGERY",
  "MENTAL_HEALTH",
] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_LABEL: Record<Service, string> = {
  EMERGENCY_CARE: "Emergency care",
  GENERAL_MEDICINE: "General medicine",
  INTERNAL_MEDICINE: "Internal medicine",
  PAEDIATRICS: "Paediatrics",
  MATERNITY: "Maternity",
  SURGERY: "Surgery",
  MENTAL_HEALTH: "Mental health",
};

/** Rwanda's levels of care, lowest to highest (DECISIONS.md D21). */
export const FACILITY_LEVELS = ["HEALTH_POST", "HEALTH_CENTRE", "DISTRICT_HOSPITAL", "PROVINCIAL_HOSPITAL", "REFERRAL_HOSPITAL"] as const;
export type FacilityLevel = (typeof FACILITY_LEVELS)[number];

export const LEVEL_LABEL: Record<FacilityLevel, string> = {
  HEALTH_POST: "Health post",
  HEALTH_CENTRE: "Health centre",
  DISTRICT_HOSPITAL: "District hospital",
  PROVINCIAL_HOSPITAL: "Provincial hospital",
  REFERRAL_HOSPITAL: "Referral hospital",
};

/** Rwanda's 5 provinces and 30 districts. */
export const DISTRICTS: Record<string, string[]> = {
  "Kigali City": ["Gasabo", "Kicukiro", "Nyarugenge"],
  "Eastern Province": ["Bugesera", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Nyagatare", "Rwamagana"],
  "Northern Province": ["Burera", "Gakenke", "Gicumbi", "Musanze", "Rulindo"],
  "Southern Province": ["Gisagara", "Huye", "Kamonyi", "Muhanga", "Nyamagabe", "Nyanza", "Nyaruguru", "Ruhango"],
  "Western Province": ["Karongi", "Ngororero", "Nyabihu", "Nyamasheke", "Rubavu", "Rusizi", "Rutsiro"],
};
export const PROVINCES = Object.keys(DISTRICTS);
export const provinceOf = (district: string) => PROVINCES.find((p) => DISTRICTS[p].includes(district));

// ---------- Shifts (FR 8.4): Day 07:00 to 19:00, Night 19:00 to 07:00, Kigali time (UTC+2, no DST) ----------

export const SHIFTS = ["DAY", "NIGHT"] as const;
export type ShiftType = (typeof SHIFTS)[number];
export const SHIFT_LABEL: Record<ShiftType, string> = { DAY: "Day", NIGHT: "Night" };
export const SHIFT_HOURS: Record<ShiftType, string> = { DAY: "07:00–19:00", NIGHT: "19:00–07:00" };

const KIGALI_OFFSET_MS = 2 * 3_600_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** The shift running at this moment. A night shift belongs to the date it started on. */
export function currentShift(now = new Date()): { date: string; shift: ShiftType } {
  const local = new Date(now.getTime() + KIGALI_OFFSET_MS);
  const hour = local.getUTCHours();
  const today = iso(local);
  if (hour >= 7 && hour < 19) return { date: today, shift: "DAY" };
  return { date: hour >= 19 ? today : addDays(today, -1), shift: "NIGHT" };
}

/** Monday of the week that contains this date (YYYY-MM-DD). */
export function weekStart(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return addDays(isoDate, -back);
}
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export { addDays };

// ---------- Forms ----------

const coordinate = (min: number, max: number, msg: string) => z.coerce.number({ error: msg }).min(min, msg).max(max, msg);

/** Rwanda lies within about 1.0°–2.9° S and 28.8°–30.9° E. */
export const facilityProfile = z.object({
  name: z.string().trim().min(3, "Enter the facility name").max(120),
  level: z.enum(FACILITY_LEVELS, "Choose the level of care"),
  services: z.array(z.enum(SERVICES)).min(1, "Choose at least one service"),
  district: z.string().refine((d) => !!provinceOf(d), "Choose a district"),
  sector: z.string().trim().max(60).optional(),
  latitude: coordinate(-2.9, -1.0, "Enter a latitude inside Rwanda, e.g. -1.9441"),
  longitude: coordinate(28.8, 30.9, "Enter a longitude inside Rwanda, e.g. 30.0619"),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?250)?\s?0?7\d{2}\s?\d{3}\s?\d{3}$|^$/, "Enter a Rwandan number like 0788 123 456")
    .optional(),
  active: z.boolean(),
});
export type FacilityProfile = z.infer<typeof facilityProfile>;

export const bedCapacity = z.object({ totalBeds: z.coerce.number().int("Enter a whole number").min(0).max(5000) });

export const clinicianInvite = z.object({
  name: z.string().trim().min(2, "Enter the full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter an email address like name@example.com"),
  specialty: z.enum(SERVICES, "Choose a specialty"),
  licenceNumber: z.string().trim().min(3, "Enter the licence number").max(40),
});

export const shiftToggle = z.object({
  staffId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(SHIFTS),
  assigned: z.boolean(),
});

export const unavailability = z.object({ reason: z.string().trim().max(200).optional(), unavailable: z.boolean() });

export const redFlagQuestion = z.object({
  group: z.enum(["A", "C", "N", "P"], "Choose a group"),
  textEn: z.string().trim().min(10, "Write the question in English").max(300),
  textRw: z.string().trim().max(300).optional(),
  service: z.enum(SERVICES, "Choose the service needed"),
  source: z.string().trim().max(200).optional(),
});

export const RED_FLAG_GROUP_LABEL = {
  A: "Everyone",
  C: "Children under 12",
  N: "Babies under 2 months",
  P: "Pregnancy",
} as const;
