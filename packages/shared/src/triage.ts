import type { Service } from "./catalog";

/**
 * The safety rules of triage and routing. They are plain functions with no database or network,
 * so each rule can be tested on its own. The API calls these; nothing else decides a triage level or a service.
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

export const TRIAGE_LABEL: Record<TriageLevel, string> = {
  URGENT: "Urgent",
  UNCERTAIN: "Uncertain",
  MINOR: "Minor",
};

export const DURATIONS = ["TODAY", "ONE_TO_THREE_DAYS", "FOUR_TO_SEVEN_DAYS", "MORE_THAN_A_WEEK"] as const;
export type Duration = (typeof DURATIONS)[number];

export const DURATION_LABEL: Record<Duration, string> = {
  TODAY: "Since today",
  ONE_TO_THREE_DAYS: "1 to 3 days",
  FOUR_TO_SEVEN_DAYS: "4 to 7 days",
  MORE_THAN_A_WEEK: "More than a week",
};

// Age

const MS_PER_DAY = 86_400_000;

/** Whole days, months and years between a date of birth and now, counted on UTC dates. */
export function age(dateOfBirth: string | Date, now = new Date()) {
  const born = new Date(dateOfBirth);

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const bornUtc = Date.UTC(born.getUTCFullYear(), born.getUTCMonth(), born.getUTCDate());
  const days = Math.floor((todayUtc - bornUtc) / MS_PER_DAY);

  const birthdayNotReachedThisMonth = now.getUTCDate() < born.getUTCDate();
  const birthdayNotReachedThisYear =
    now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && birthdayNotReachedThisMonth);

  let years = now.getUTCFullYear() - born.getUTCFullYear();
  if (birthdayNotReachedThisYear) years--;

  let months = (now.getUTCFullYear() - born.getUTCFullYear()) * 12 + (now.getUTCMonth() - born.getUTCMonth());
  if (birthdayNotReachedThisMonth) months--;

  return { days, months, years };
}

/** The age staff see in summaries: "7 years", "5 months" or "3 days". */
export function ageLabel(dateOfBirth: string | Date, now = new Date()) {
  const { days, months, years } = age(dateOfBirth, now);
  if (years >= 1) return `${years} years`;
  if (months >= 1) return `${months} months`;
  return `${days} days`;
}

// Red flags (the danger-sign questions)

export type Sex = "FEMALE" | "MALE";
export type RedFlagGroup = "A" | "C" | "N" | "P";

/** A baby under 8 days old is Urgent without any question. */
export function isNewborn(patientAge: { days: number }) {
  return patientAge.days < 8;
}

/** "Are you pregnant?" is asked only of females aged 12 to 55. */
export function asksPregnancy(sex: Sex, patientAge: { years: number }) {
  return sex === "FEMALE" && patientAge.years >= 12 && patientAge.years <= 55;
}

/**
 * Which groups of questions a patient is asked:
 * A for everyone, C for children under 12, N for babies under 2 months, P for a pregnant woman aged 12 to 55.
 */
export function redFlagGroups(
  sex: Sex,
  patientAge: { months: number; years: number },
  pregnant: boolean | null,
): RedFlagGroup[] {
  const groups: RedFlagGroup[] = ["A"];
  if (patientAge.years < 12) groups.push("C");
  if (patientAge.months < 2) groups.push("N");
  if (asksPregnancy(sex, patientAge) && pregnant === true) groups.push("P");
  return groups;
}

// The service a patient needs

/** Fits and difficult breathing: for a pregnant woman these go to Maternity rather than their usual service. */
const MATERNITY_WHEN_PREGNANT = ["A2", "A3"];

export function chooseService(input: {
  redFlag?: { code: string; service: Service } | null;
  pregnant?: boolean | null;
  years: number;
  category?: Category | null;
}): Service {
  const { redFlag, pregnant, years, category } = input;
  const isInjuryOrBurn = category === "INJURY" || category === "BURN";

  // 1. A danger sign answered Yes decides the service.
  if (redFlag) {
    if (pregnant && MATERNITY_WHEN_PREGNANT.includes(redFlag.code)) return "MATERNITY";
    return redFlag.service;
  }
  // 2. Pregnancy problems go to Maternity.
  if (category === "PREGNANCY") return "MATERNITY";
  // 3. Children under 12 go to Paediatrics, except for injuries and burns.
  if (years < 12 && !isInjuryOrBurn) return "PAEDIATRICS";
  // 4. Injuries, burns and bleeding wounds go to Surgery.
  if (isInjuryOrBurn) return "SURGERY";
  // 5. Chest pain and heart problems go to Internal medicine.
  if (category === "CHEST_PAIN_OR_HEART") return "INTERNAL_MEDICINE";
  // 6. Mental health problems go to Mental health.
  if (category === "MENTAL_HEALTH") return "MENTAL_HEALTH";
  // 7. Anything else goes to General medicine.
  return "GENERAL_MEDICINE";
}

// Triage level

export type AiOutcome =
  | {
      ok: true;
      category: Category | null;
      urgency: Urgency | null;
      confidence: Confidence | null;
      reason: string | null;
    }
  | { ok: false; error: "TIMEOUT" | "ERROR" | "OFF" | "BREAKER_OPEN" | "NOT_CONFIGURED" };

export function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The rules, in this order:
 * 1. Urgent when the AI suggests urgent, at any confidence.
 * 2. Otherwise Uncertain when anything makes the AI's answer doubtful (listed in the reason).
 * 3. Otherwise Minor when the AI suggests minor with medium or high confidence.
 * Anything left is Uncertain. An Uncertain case is never treated as Minor.
 */
export function triageLevel(
  ai: AiOutcome,
  description: string,
  preferCall: boolean,
): { level: TriageLevel; reason: string } {
  if (ai.ok && ai.urgency === "URGENT") {
    return { level: "URGENT", reason: "The AI suggested urgent." };
  }

  const doubts: string[] = [];
  if (!ai.ok) {
    doubts.push(ai.error === "OFF" ? "AI switched off" : "AI unavailable");
  } else {
    if (!ai.category || !ai.urgency) doubts.push("AI gave no category or urgency");
    if (ai.confidence === "LOW") doubts.push("AI confidence low");
  }
  if (wordCount(description) < 5) doubts.push("description shorter than 5 words");
  if (preferCall) doubts.push("patient chose Prefer a call");

  if (doubts.length > 0) {
    return { level: "UNCERTAIN", reason: `Uncertain: ${doubts.join("; ")}.` };
  }

  const confidentMinor = ai.ok && ai.urgency === "MINOR" && (ai.confidence === "MEDIUM" || ai.confidence === "HIGH");
  if (confidentMinor) {
    return { level: "MINOR", reason: `The AI suggested minor with ${ai.confidence!.toLowerCase()} confidence.` };
  }

  return { level: "UNCERTAIN", reason: "Uncertain: the AI result did not meet the rules for Minor." };
}

// Distance and facility matching

type Point = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line distance between two points, in km (the haversine formula). */
export function distanceKm(from: Point, to: Point) {
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const h =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
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
  /** Specialties of the clinicians on duty this shift who aren't marked unavailable. */
  onDuty: Service[];
};

export type Match =
  | { kind: "SUITABLE"; facility: FacilityForMatch; km: number; ranked: { facility: FacilityForMatch; km: number }[] }
  | { kind: "NO_BEDS"; facility: FacilityForMatch; km: number }
  | { kind: "NO_MATCH" };

/**
 * Finds where to send a patient.
 * A facility can take them when it is active, offers the service and has a clinician of that specialty on duty now.
 * If a bed is needed, it must also have one free. The nearest one wins.
 * If none has a free bed, the nearest one that could otherwise take them is returned as NO_BEDS.
 * If none can take them at all, the answer is NO_MATCH.
 */
export function matchFacilities(
  facilities: FacilityForMatch[],
  patientAt: Point,
  service: Service,
  bedNeeded: boolean,
): Match {
  const capable = facilities
    .filter((facility) => facility.active && facility.services.includes(service) && facility.onDuty.includes(service))
    .map((facility) => ({ facility, km: distanceKm(patientAt, { lat: facility.latitude, lng: facility.longitude }) }))
    .sort((a, b) => a.km - b.km);

  if (capable.length === 0) return { kind: "NO_MATCH" };

  const ranked = bedNeeded ? capable.filter((option) => option.facility.freeBeds > 0) : capable;
  if (ranked.length === 0) {
    const nearest = capable[0];
    return { kind: "NO_BEDS", facility: nearest.facility, km: nearest.km };
  }

  const best = ranked[0];
  return { kind: "SUITABLE", facility: best.facility, km: best.km, ranked };
}

/** The 5 nearest active facilities. The patient app saves them on the device so they can be shown offline. */
export function nearestFacilities<T extends { active: boolean; latitude: number; longitude: number }>(
  facilities: T[],
  patientAt: Point,
  howMany = 5,
) {
  return facilities
    .filter((facility) => facility.active)
    .map((facility) => ({
      ...facility,
      km: distanceKm(patientAt, { lat: facility.latitude, lng: facility.longitude }),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, howMany);
}

/** "2.1 km", or "650 m" under 1 km (rounded to the nearest 10 m). */
export function formatKm(km: number) {
  if (km < 1) {
    const metres = Math.round(km * 100) * 10;
    return `${metres} m`;
  }
  return `${km.toFixed(1)} km`;
}
