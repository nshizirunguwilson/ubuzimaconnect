import { describe, expect, it } from "vitest";
import { SECTORS, sectorsOf } from "./sectors";
import {
  age,
  asksPregnancy,
  chooseService,
  distanceKm,
  isNewborn,
  matchFacilities,
  redFlagGroups,
  triageLevel,
  type FacilityForMatch,
} from "./triage";

const now = new Date("2026-10-24T10:00:00Z");

describe("red-flag groups (Appendix C, FR 3.6, 4.2)", () => {
  it("marks babies under 8 days as newborns (FR 4.2)", () => {
    expect(isNewborn(age("2026-10-17", now))).toBe(true); // 7 days
    expect(isNewborn(age("2026-10-16", now))).toBe(false); // 8 days
  });

  it("asks A always, C under 12, N under 2 months, P only when pregnant and female 12–55", () => {
    expect(redFlagGroups("MALE", age("1990-01-01", now), null)).toEqual(["A"]);
    expect(redFlagGroups("MALE", age("2019-06-02", now), null)).toEqual(["A", "C"]);
    expect(redFlagGroups("FEMALE", age("2026-09-10", now), null)).toEqual(["A", "C", "N"]);
    expect(redFlagGroups("FEMALE", age("1992-03-14", now), true)).toEqual(["A", "P"]);
    expect(redFlagGroups("FEMALE", age("1992-03-14", now), false)).toEqual(["A"]);
    expect(asksPregnancy("FEMALE", age("1960-12-25", now))).toBe(false); // 65
    expect(asksPregnancy("FEMALE", age("2014-10-24", now))).toBe(true); // exactly 12
    expect(asksPregnancy("MALE", age("1992-03-14", now))).toBe(false);
  });
});

describe("needed service (FR 5.1, in order)", () => {
  it("takes the red-flag question's service, Maternity for a pregnant woman with A2 or A3", () => {
    expect(chooseService({ redFlag: { code: "A4", service: "SURGERY" }, years: 30 })).toBe("SURGERY");
    expect(chooseService({ redFlag: { code: "A2", service: "EMERGENCY_CARE" }, pregnant: true, years: 30 })).toBe("MATERNITY");
    expect(chooseService({ redFlag: { code: "A2", service: "EMERGENCY_CARE" }, pregnant: false, years: 30 })).toBe("EMERGENCY_CARE");
  });

  it("then pregnancy, children, injuries and burns, heart, mental health, general", () => {
    expect(chooseService({ years: 25, category: "PREGNANCY" })).toBe("MATERNITY");
    expect(chooseService({ years: 7, category: "FEVER_OR_INFECTION" })).toBe("PAEDIATRICS");
    expect(chooseService({ years: 7, category: "BURN" })).toBe("SURGERY");
    expect(chooseService({ years: 40, category: "INJURY" })).toBe("SURGERY");
    expect(chooseService({ years: 40, category: "CHEST_PAIN_OR_HEART" })).toBe("INTERNAL_MEDICINE");
    expect(chooseService({ years: 40, category: "MENTAL_HEALTH" })).toBe("MENTAL_HEALTH");
    expect(chooseService({ years: 40, category: "SKIN" })).toBe("GENERAL_MEDICINE");
    expect(chooseService({ years: 40, category: null })).toBe("GENERAL_MEDICINE");
  });
});

describe("triage level (FR 4.4, 4.5)", () => {
  const long = "I have had a bad cough and fever since yesterday evening";
  const ai = (urgency: "URGENT" | "MINOR" | null, confidence: "LOW" | "MEDIUM" | "HIGH" | null, category: "RESPIRATORY" | null = "RESPIRATORY") =>
    ({ ok: true as const, category, urgency, confidence, reason: "r" });

  it("is Urgent when the AI says urgent, at any confidence, even with a short description", () => {
    expect(triageLevel(ai("URGENT", "LOW"), "pain", false).level).toBe("URGENT");
  });

  it("is Uncertain for each FR 4.5 condition", () => {
    expect(triageLevel(ai(null, "HIGH"), long, false).level).toBe("UNCERTAIN"); // (a) no urgency
    expect(triageLevel(ai("MINOR", "HIGH", null), long, false).level).toBe("UNCERTAIN"); // (a) no category
    expect(triageLevel({ ok: false, error: "TIMEOUT" }, long, false).level).toBe("UNCERTAIN"); // (b)
    expect(triageLevel(ai("MINOR", "LOW"), long, false).level).toBe("UNCERTAIN"); // (c)
    expect(triageLevel(ai("MINOR", "HIGH"), "cough", false).level).toBe("UNCERTAIN"); // (d) under 5 words
    expect(triageLevel(ai("MINOR", "HIGH"), long, true).level).toBe("UNCERTAIN"); // (e) prefer a call
    expect(triageLevel({ ok: false, error: "OFF" }, long, false).reason).toContain("switched off"); // FR 4.8
  });

  it("is Minor only with a minor suggestion at medium or high confidence", () => {
    expect(triageLevel(ai("MINOR", "MEDIUM"), long, false).level).toBe("MINOR");
    expect(triageLevel(ai("MINOR", "HIGH"), long, false).level).toBe("MINOR");
  });
});

describe("facility matching (FR 5.3, 5.4, 5.8, 5.9)", () => {
  const at = { lat: -1.95, lng: 30.09 };
  const f = (id: string, lat: number, lng: number, over: Partial<FacilityForMatch> = {}): FacilityForMatch => ({
    id,
    name: id,
    active: true,
    services: ["EMERGENCY_CARE", "GENERAL_MEDICINE"],
    latitude: lat,
    longitude: lng,
    phone: null,
    freeBeds: 5,
    onDuty: ["EMERGENCY_CARE", "GENERAL_MEDICINE"],
    ...over,
  });

  it("measures straight-line distance (Haversine)", () => {
    // Kigali to Huye is about 76 km in a straight line.
    expect(distanceKm({ lat: -1.9441, lng: 30.0619 }, { lat: -2.5967, lng: 29.7394 })).toBeGreaterThan(75);
    expect(distanceKm({ lat: -1.9441, lng: 30.0619 }, { lat: -2.5967, lng: 29.7394 })).toBeLessThan(83);
  });

  it("picks the nearest suitable facility, skipping inactive ones and ones without the specialty on duty", () => {
    const list = [
      f("near-inactive", -1.951, 30.091, { active: false }),
      f("near-no-specialist", -1.952, 30.092, { onDuty: ["GENERAL_MEDICINE"] }),
      f("mid", -1.96, 30.1),
      f("far", -2.1, 30.3),
    ];
    const m = matchFacilities(list, at, "EMERGENCY_CARE", false);
    expect(m.kind).toBe("SUITABLE");
    if (m.kind === "SUITABLE") expect(m.ranked.map((r) => r.facility.id)).toEqual(["mid", "far"]);
  });

  it("needs a free bed when a bed is needed, and falls back to 'no beds' then 'no match'", () => {
    const full = [f("a", -1.96, 30.1, { freeBeds: 0 }), f("b", -2.1, 30.3, { freeBeds: 0 })];
    const m = matchFacilities(full, at, "EMERGENCY_CARE", true);
    expect(m.kind).toBe("NO_BEDS");
    if (m.kind === "NO_BEDS") expect(m.facility.id).toBe("a");
    expect(matchFacilities(full, at, "EMERGENCY_CARE", false).kind).toBe("SUITABLE");
    expect(matchFacilities(full, at, "MATERNITY", false).kind).toBe("NO_MATCH");
  });
});

describe("sectors (FR 3.4)", () => {
  it("has all 416 sectors inside Rwanda", () => {
    expect(SECTORS).toHaveLength(416);
    expect(sectorsOf("Gasabo")).toHaveLength(15);
    expect(SECTORS.every((s) => s.lat < -1 && s.lat > -2.9 && s.lng > 28.8 && s.lng < 30.9)).toBe(true);
  });
});
