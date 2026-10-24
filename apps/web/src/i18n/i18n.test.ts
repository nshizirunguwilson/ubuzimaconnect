import { describe, expect, it } from "vitest";
import { formatDateIn } from "./dates";
import { en } from "./en";
import { rw } from "./rw";
import { translate } from "./sentences";

/** Every text, with functions called with a sample value, keyed by its path. */
function flatten(o: unknown, path = ""): Record<string, string> {
  if (typeof o === "string") return { [path]: o };
  if (typeof o === "function") return { [path]: String((o as (...a: unknown[]) => unknown)(...sampleArgs(o as (...a: unknown[]) => unknown))) };
  return Object.assign({}, ...Object.entries(o as object).map(([k, v]) => flatten(v, path ? `${path}.${k}` : k)));
}
function sampleArgs(f: (...a: unknown[]) => unknown) {
  // Numbers for counts, a string for names and dates, a boolean for sex, an age object for records.age.
  const src = String(f);
  if (src.includes("years >=")) return [{ years: 7, months: 84, days: 2550 }];
  if (src.includes("female")) return [true, "7 years", "2 Jun 2019"];
  return Array.from({ length: f.length || 1 }, (_, i) => (/\bn\b|days|age|total/.test(src) && i < 2 ? 3 : "Kevin"));
}

// Words that are the same in both languages.
const SAME_TEXT = new Set(["English", "Kinyarwanda", "UbuzimaConnect"]);

describe("Kinyarwanda catalogue (NFR 7)", () => {
  const E = flatten(en);
  const R = flatten(rw);

  it("has a Kinyarwanda text for every English one", () => {
    expect(Object.keys(R).sort()).toEqual(Object.keys(E).sort());
    for (const [k, v] of Object.entries(R)) expect(v.trim(), k).not.toBe("");
  });

  it("leaves nothing in English by mistake", () => {
    const same = Object.keys(E).filter((k) => E[k] === R[k] && !SAME_TEXT.has(E[k]) && !/^\d/.test(E[k]));
    expect(same).toEqual([]);
  });

  it("translates messages written by the server, with their values", () => {
    expect(translate("rw", "Another agent will continue with you.")).toBe("Undi mukozi w'ubuzima azakomezanya nawe.");
    expect(translate("rw", "Diane, a health agent, is now looking at your request.")).toBe("Diane, umukozi w'ubuzima, ari kureba ubusabe bwawe.");
    expect(translate("rw", "Go to Kacyiru District Hospital (0788 300 101). They are expecting you for the next 24 hours.")).toContain("Jya kuri Kacyiru District Hospital (0788 300 101)");
    expect(translate("rw", "A sentence nobody translated.")).toBe("A sentence nobody translated.");
    expect(translate("en", "Another agent will continue with you.")).toBe("Another agent will continue with you.");
  });

  it("writes dates with Kinyarwanda month names, in Rwanda time", () => {
    expect(formatDateIn("rw", "2026-10-24T21:30:00Z")).toBe("24 Ukwakira 2026");
    expect(formatDateIn("rw", "2026-10-31T22:30:00Z")).toBe("1 Ugushyingo 2026"); // 00:30 in Kigali
    expect(formatDateIn("en", "2026-10-24T08:00:00Z")).toBe("24 Oct 2026");
  });
});
