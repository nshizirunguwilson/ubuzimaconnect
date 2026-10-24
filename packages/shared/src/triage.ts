import type { Service } from "./catalog";

/**
 * The safety rules of triage and routing, as pure functions so they can be tested line by line
 * against the SRS. The API calls these; nothing else decides a triage level or a service.
 */

export const CATEGORIES = [
  "RESPIRATORY",
  "FEVER_OR_INFECTION",
  "DIGESTIVE",
  "SKIN",
  "URINARY",
  "INJURY",
  "BURN",
  "PREGNANCY",
  "CHEST_PAIN_OR_HEART",
  "NEUROLOGICAL",
  "MENTAL_HEALTH",
  "OTHER",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  RESPIRATORY: "Breathing or chest infection",
  FEVER_OR_INFECTION: "Fever or infection",
  DIGESTIVE: "Stomach or digestion",
  SKIN: "Skin",
  URINARY: "Urine or kidneys",
  INJURY: "Injury",
  BURN: "Burn",
  PREGNANCY: "Pregnancy",
  CHEST_PAIN_OR_HEART: "Chest pain or heart",
  NEUROLOGICAL: "Brain or nerves",
  MENTAL_HEALTH: "Mental health",
  OTHER: "Other",
};

export type TriageLevel = "URGENT" | "UNCERTAIN" | "MINOR";
export type Urgency = "URGENT" | "MINOR";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export const TRIAGE_LABEL: Record<TriageLevel, string> = { URGENT: "Urgent", UNCERTAIN: "Uncertain", MINOR: "Minor" };

export const DURATIONS = ["TODAY", "ONE_TO_THREE_DAYS", "FOUR_TO_SEVEN_DAYS", "MORE_THAN_A_WEEK"] as const;
export type Duration = (typeof DURATIONS)[number];
export const DURATION_LABEL: Record<Duration, string> = {
  TODAY: "Since today",
  ONE_TO_THREE_DAYS: "1 to 3 days",
  FOUR_TO_SEVEN_DAYS: "4 to 7 days",
  MORE_THAN_A_WEEK: "More than a week",
};

// ---------- Age ----------

/** Whole days and years between a date of birth and now (UTC dates). */
export function age(dateOfBirth: string | Date, now = new Date()) {
  const dob = new Date(dateOfBirth);
  const days = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(dob.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate())) / 86_400_000);
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) years--;
  let months = (now.getUTCFullYear() - dob.getUTCFullYear()) * 12 + now.getUTCMonth() - dob.getUTCMonth();
  if (now.getUTCDate() < dob.getUTCDate()) months--;
  return { days, months, years };
}

/** "7 years", "5 months", "3 days": the age staff see in summaries. */
export function ageLabel(dateOfBirth: string | Date, now = new Date()) {
  const a = age(dateOfBirth, now);
  return a.years >= 1 ? `${a.years} years` : a.months >= 1 ? `${a.months} months` : `${a.days} days`;
}

// ---------- Red flags (FR 3.6, 4.1, 4.2, Appendix C) ----------

export type Sex = "FEMALE" | "MALE";
export type RedFlagGroup = "A" | "C" | "N" | "P";

/** FR 4.2: a baby under 8 days old is Urgent without any question. */
export const isNewborn = (a: { days: number }) => a.days < 8;

/** Appendix C: "Are you pregnant?" is asked only of females aged 12 to 55. */
export const asksPregnancy = (sex: Sex, a: { years: number }) => sex === "FEMALE" && a.years >= 12 && a.years <= 55;

/** Appendix C: A always; C under 12; N under 2 months; P when female 12–55 and pregnant. */
export function redFlagGroups(sex: Sex, a: { months: number; years: number }, pregnant: boolean | null): RedFlagGroup[] {
  const groups: RedFlagGroup[] = ["A"];
  if (a.years < 12) groups.push("C");
  if (a.months < 2) groups.push("N");
  if (asksPregnancy(sex, a) && pregnant === true) groups.push("P");
  return groups;
}

// ---------- Needed service (FR 5.1) ----------

export function chooseService(input: {
  redFlag?: { code: string; service: Service } | null;
  pregnant?: boolean | null;
  years: number;
  category?: Category | null;
}): Service {
  const { redFlag, pregnant, years, category } = input;
  // 1. The service of the red-flag question answered Yes (Maternity for a pregnant woman with a fit or difficult breathing).
  if (redFlag) return pregnant && (redFlag.code === "A2" || redFlag.code === "A3") ? "MATERNITY" : redFlag.service;
  // 2. Maternity for pregnancy problems.
  if (category === "PREGNANCY") return "MATERNITY";
  // 3. Paediatrics for children under 12, except injuries and burns.
  if (years < 12 && category !== "INJURY" && category !== "BURN") return "PAEDIATRICS";
  // 4. Surgery for injuries, burns and bleeding wounds.
  if (category === "INJURY" || category === "BURN") return "SURGERY";
  // 5. Internal medicine for chest pain or heart problems.
  if (category === "CHEST_PAIN_OR_HEART") return "INTERNAL_MEDICINE";
  // 6. Mental health for mental health problems.
  if (category === "MENTAL_HEALTH") return "MENTAL_HEALTH";
  // 7. General medicine for anything else.
  return "GENERAL_MEDICINE";
}

// ---------- Triage level (FR 4.4, 4.5) ----------

export type AiOutcome =
  | { ok: true; category: Category | null; urgency: Urgency | null; confidence: Confidence | null; reason: string | null }
  | { ok: false; error: "TIMEOUT" | "ERROR" | "OFF" | "BREAKER_OPEN" | "NOT_CONFIGURED" };

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * FR 4.4, in this order: Urgent when the AI suggests urgent, at any confidence; otherwise Uncertain when
 * any FR 4.5 condition is true; otherwise Minor when the AI suggests minor with medium or high confidence.
 * An Uncertain case is never treated as Minor.
 */
export function triageLevel(ai: AiOutcome, description: string, preferCall: boolean): { level: TriageLevel; reason: string } {
  if (ai.ok && ai.urgency === "URGENT") return { level: "URGENT", reason: "The AI suggested urgent." };
  const why: string[] = [];
  if (!ai.ok) why.push(ai.error === "OFF" ? "AI switched off" : "AI unavailable");
  else {
    if (!ai.category || !ai.urgency) why.push("AI gave no category or urgency");
    if (ai.confidence === "LOW") why.push("AI confidence low");
  }
  if (wordCount(description) < 5) why.push("description shorter than 5 words");
  if (preferCall) why.push("patient chose Prefer a call");
  if (why.length > 0) return { level: "UNCERTAIN", reason: `Uncertain: ${why.join("; ")}.` };
  if (ai.ok && ai.urgency === "MINOR" && (ai.confidence === "MEDIUM" || ai.confidence === "HIGH")) {
    return { level: "MINOR", reason: "The AI suggested minor with " + ai.confidence.toLowerCase() + " confidence." };
  }
  return { level: "UNCERTAIN", reason: "Uncertain: the AI result did not meet the rules for Minor." };
}

// ---------- Distance and matching (FR 3.5, 5.3, 5.4, 5.8, 5.9) ----------

/** Haversine distance in km (FR 5.4: straight-line distance). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type FacilityForMatch = {
  id: string;
  name: string;
  active: boolean;
  services: Service[];
  latitude: number;
  longitude: number;
  phone: string | null;
  freeBeds: number;
  /** Specialties of clinicians on duty in the current shift and not marked unavailable */
  onDuty: Service[];
};

export type Match =
  | { kind: "SUITABLE"; facility: FacilityForMatch; km: number; ranked: { facility: FacilityForMatch; km: number }[] }
  | { kind: "NO_BEDS"; facility: FacilityForMatch; km: number }
  | { kind: "NO_MATCH" };

/**
 * FR 5.3: suitable = active, offers the service, a clinician of that specialty on duty now, and a free
 * bed when one is needed. FR 5.4: ranked by distance. FR 5.8: none with a bed → the nearest otherwise
 * suitable one, marked no beds. FR 5.9: none at all → no match.
 */
export function matchFacilities(facilities: FacilityForMatch[], at: { lat: number; lng: number }, service: Service, bedNeeded: boolean): Match {
  const withKm = (f: FacilityForMatch) => ({ facility: f, km: distanceKm(at, { lat: f.latitude, lng: f.longitude }) });
  const capable = facilities
    .filter((f) => f.active && f.services.includes(service) && f.onDuty.includes(service))
    .map(withKm)
    .sort((a, b) => a.km - b.km);
  if (capable.length === 0) return { kind: "NO_MATCH" };
  const ranked = bedNeeded ? capable.filter((c) => c.facility.freeBeds > 0) : capable;
  if (ranked.length === 0) return { kind: "NO_BEDS", ...capable[0] };
  return { kind: "SUITABLE", ...ranked[0], ranked };
}

/** FR 3.5: the 5 nearest active facilities, saved on the device so they can be shown offline. */
export function nearestFacilities<T extends { active: boolean; latitude: number; longitude: number }>(facilities: T[], at: { lat: number; lng: number }, n = 5) {
  return facilities
    .filter((f) => f.active)
    .map((f) => ({ ...f, km: distanceKm(at, { lat: f.latitude, lng: f.longitude }) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}

/** "2.1 km", or "650 m" under 1 km. */
export const formatKm = (km: number) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`);
