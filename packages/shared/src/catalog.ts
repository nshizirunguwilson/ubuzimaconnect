import { z } from "zod";

/** The fixed list of care types. A clinician's specialty is one of these too. */
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

/** Rwanda's levels of care, lowest to highest. */
export const FACILITY_LEVELS = [
  "HEALTH_POST",
  "HEALTH_CENTRE",
  "DISTRICT_HOSPITAL",
  "PROVINCIAL_HOSPITAL",
  "REFERRAL_HOSPITAL",
] as const;
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

export function provinceOf(district: string) {
  return PROVINCES.find((province) => DISTRICTS[province].includes(district));
}

// Shifts: Day runs 07:00 to 19:00 and Night 19:00 to 07:00, in Kigali time (UTC+2, no daylight saving).

export const SHIFTS = ["DAY", "NIGHT"] as const;
export type ShiftType = (typeof SHIFTS)[number];
export const SHIFT_LABEL: Record<ShiftType, string> = { DAY: "Day", NIGHT: "Night" };
export const SHIFT_HOURS: Record<ShiftType, string> = { DAY: "07:00–19:00", NIGHT: "19:00–07:00" };

const KIGALI_OFFSET_MS = 2 * 3_600_000;
const DAY_SHIFT_STARTS = 7;
const NIGHT_SHIFT_STARTS = 19;

/** A date as YYYY-MM-DD. */
function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The YYYY-MM-DD date a number of days before (negative) or after this one. */
export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** The shift running at this moment. A night shift belongs to the date it started on. */
export function currentShift(now = new Date()): { date: string; shift: ShiftType } {
  const kigaliTime = new Date(now.getTime() + KIGALI_OFFSET_MS);
  const hour = kigaliTime.getUTCHours();
  const today = toIsoDate(kigaliTime);

  if (hour >= DAY_SHIFT_STARTS && hour < NIGHT_SHIFT_STARTS) {
    return { date: today, shift: "DAY" };
  }
  // Between midnight and 07:00 we are still in the night shift that started yesterday.
  const nightStartedOn = hour >= NIGHT_SHIFT_STARTS ? today : addDays(today, -1);
  return { date: nightStartedOn, shift: "NIGHT" };
}

/** True when this shift is over: an earlier date, or today's day shift once the night shift has begun. */
export function shiftHasEnded(date: string, shift: ShiftType, now = currentShift()) {
  if (date < now.date) return true;
  return date === now.date && shift === "DAY" && now.shift === "NIGHT";
}

/** True when this shift has begun: it has ended, or it is the shift running now. */
export function shiftHasStarted(date: string, shift: ShiftType, now = currentShift()) {
  if (date < now.date) return true;
  return date === now.date && (shift === "DAY" || now.shift === "NIGHT");
}

/** The Monday of the week that contains this date (YYYY-MM-DD). */
export function weekStart(isoDate: string) {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  const daysSinceMonday = (weekday + 6) % 7;
  return addDays(isoDate, -daysSinceMonday);
}

/** The seven dates of the week starting on this Monday. */
export function weekDays(monday: string) {
  return Array.from({ length: 7 }, (_, dayIndex) => addDays(monday, dayIndex));
}

// Forms

function coordinate(min: number, max: number, message: string) {
  return z.coerce.number({ error: message }).min(min, message).max(max, message);
}

/** Rwanda lies within about 1.0 to 2.9 degrees south and 28.8 to 30.9 degrees east. */
export const facilityProfile = z.object({
  name: z.string().trim().min(3, "Enter the facility name").max(120),
  level: z.enum(FACILITY_LEVELS, "Choose the level of care"),
  services: z.array(z.enum(SERVICES)).min(1, "Choose at least one service"),
  district: z.string().refine((district) => provinceOf(district) !== undefined, "Choose a district"),
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

export const bedCapacity = z.object({
  totalBeds: z.coerce.number().int("Enter a whole number").min(0).max(5000),
});

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

export const unavailability = z.object({
  reason: z.string().trim().max(200).optional(),
  unavailable: z.boolean(),
});

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
