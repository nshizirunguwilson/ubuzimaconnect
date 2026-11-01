import { describe, expect, it } from "vitest";
import { partsToIsoDate } from "./date-parts";

const today = new Date("2026-11-01T12:00:00Z");

describe("a date typed in three boxes", () => {
  it("becomes YYYY-MM-DD, with the day and month padded", () => {
    expect(partsToIsoDate({ day: "14", month: "3", year: "1992" }, today)).toBe("1992-03-14");
    expect(partsToIsoDate({ day: "1", month: "12", year: "1960" }, today)).toBe("1960-12-01");
  });

  it("is empty until every box is filled", () => {
    expect(partsToIsoDate({ day: "14", month: "", year: "1992" }, today)).toBe("");
    expect(partsToIsoDate({ day: "14", month: "3", year: "92" }, today)).toBe("");
  });

  it("refuses dates that don't exist or haven't happened yet", () => {
    expect(partsToIsoDate({ day: "31", month: "2", year: "1992" }, today)).toBe("");
    expect(partsToIsoDate({ day: "29", month: "2", year: "2024" }, today)).toBe("2024-02-29");
    expect(partsToIsoDate({ day: "2", month: "11", year: "2026" }, today)).toBe("");
    expect(partsToIsoDate({ day: "1", month: "1", year: "1850" }, today)).toBe("");
  });
});
