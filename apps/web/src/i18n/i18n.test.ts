import { describe, expect, it } from "vitest";
import { formatDateIn } from "./dates";
import { en } from "./en";
import { rw } from "./rw";
import { translate } from "./sentences";

/** Every text, with functions called with a sample value, keyed by its path. */
function flatten(node: unknown, path = ""): Record<string, string> {
  if (typeof node === "string") return { [path]: node };
  if (typeof node === "function")
    return {
      [path]: String((node as (...args: unknown[]) => unknown)(...sampleArgs(node as (...args: unknown[]) => unknown))),
    };
  return Object.assign(
    {},
    ...Object.entries(node as object).map(([key, value]) => flatten(value, path ? `${path}.${key}` : key)),
  );
}
function sampleArgs(textFunction: (...args: unknown[]) => unknown) {
  // Numbers for counts, a string for names and dates, a boolean for sex, an age object for records.age.
  const source = String(textFunction);
  if (source.includes("years >=")) return [{ years: 7, months: 84, days: 2550 }];
  if (source.includes("female")) return [true, "7 years", "2 Jun 2019"];
  return Array.from({ length: textFunction.length || 1 }, (_, index) =>
    /\bn\b|days|age|total/.test(source) && index < 2 ? 3 : "Kevin",
  );
}

// Words that are the same in both languages.
const SAME_TEXT = new Set(["English", "Kinyarwanda", "UbuzimaConnect"]);

describe("Kinyarwanda catalogue (NFR 7)", () => {
  const english = flatten(en);
  const kinyarwanda = flatten(rw);

  it("has a Kinyarwanda text for every English one", () => {
    expect(Object.keys(kinyarwanda).sort()).toEqual(Object.keys(english).sort());
    for (const [key, text] of Object.entries(kinyarwanda)) expect(text.trim(), key).not.toBe("");
  });

  it("leaves nothing in English by mistake", () => {
    const same = Object.keys(english).filter(
      (key) => english[key] === kinyarwanda[key] && !SAME_TEXT.has(english[key]) && !/^\d/.test(english[key]),
    );
    expect(same).toEqual([]);
  });

  it("translates messages written by the server, with their values", () => {
    expect(translate("rw", "Another agent will continue with you.")).toBe("Undi mukozi w'ubuzima azakomezanya nawe.");
    expect(translate("rw", "Diane, a health agent, is now looking at your request.")).toBe(
      "Diane, umukozi w'ubuzima, ari kureba ubusabe bwawe.",
    );
    expect(
      translate("rw", "Go to Kacyiru District Hospital (0788 300 101). They are expecting you for the next 24 hours."),
    ).toContain("Jya kuri Kacyiru District Hospital (0788 300 101)");
    expect(translate("rw", "A sentence nobody translated.")).toBe("A sentence nobody translated.");
    expect(translate("en", "Another agent will continue with you.")).toBe("Another agent will continue with you.");
  });

  it("writes dates with Kinyarwanda month names, in Rwanda time", () => {
    expect(formatDateIn("rw", "2026-10-24T21:30:00Z")).toBe("24 Ukwakira 2026");
    expect(formatDateIn("rw", "2026-10-31T22:30:00Z")).toBe("1 Ugushyingo 2026"); // 00:30 in Kigali
    expect(formatDateIn("en", "2026-10-24T08:00:00Z")).toBe("24 Oct 2026");
  });
});
