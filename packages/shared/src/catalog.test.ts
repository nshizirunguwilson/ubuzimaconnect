import { describe, expect, it } from "vitest";
import { currentShift, DISTRICTS, weekStart } from "./catalog";

describe("catalog", () => {
  it("has Rwanda's 30 districts in 5 provinces", () => {
    expect(Object.keys(DISTRICTS)).toHaveLength(5);
    expect(Object.values(DISTRICTS).flat()).toHaveLength(30);
  });

  it("finds the shift in Kigali time; a night shift belongs to the day it started (FR 8.4)", () => {
    expect(currentShift(new Date("2026-10-24T05:00:00Z"))).toEqual({ date: "2026-10-24", shift: "DAY" }); // 07:00
    expect(currentShift(new Date("2026-10-24T16:59:00Z"))).toEqual({ date: "2026-10-24", shift: "DAY" }); // 18:59
    expect(currentShift(new Date("2026-10-24T17:00:00Z"))).toEqual({ date: "2026-10-24", shift: "NIGHT" }); // 19:00
    expect(currentShift(new Date("2026-10-25T02:00:00Z"))).toEqual({ date: "2026-10-24", shift: "NIGHT" }); // 04:00 next day
  });

  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-24")).toBe("2026-10-19"); // a Saturday
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });
});

describe("report periods (FR 12.8)", () => {
  it("covers a day, a Monday-to-Sunday week, or a calendar month, in Kigali time", async () => {
    const { periodRange, shiftPeriod } = await import("./reports");
    expect(periodRange("day", "2026-10-24")).toMatchObject({ start: "2026-10-24", end: "2026-10-25" });
    expect(periodRange("week", "2026-10-24")).toMatchObject({ start: "2026-10-19", end: "2026-10-26" });
    const oct = periodRange("month", "2026-10-24");
    expect(oct).toMatchObject({ start: "2026-10-01", end: "2026-11-01" });
    expect(oct.days).toHaveLength(31);
    expect(periodRange("month", "2026-12-05").end).toBe("2027-01-01");
    expect(oct.from.toISOString()).toBe("2026-09-30T22:00:00.000Z"); // midnight in Kigali
    expect(shiftPeriod("month", "2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftPeriod("week", "2026-10-24", 1)).toBe("2026-10-26");
  });
});
