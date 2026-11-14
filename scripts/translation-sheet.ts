/**
 * NFR 7, DECISIONS.md D62: writes docs/translations/kinyarwanda-review.csv, every Kinyarwanda text beside its
 * English, for a Kinyarwanda speaker to check in any spreadsheet. Run again after changing the texts:
 *   pnpm translations
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { en } from "../apps/web/src/i18n/en";
import { rw } from "../apps/web/src/i18n/rw";
import { SENTENCES_FOR_REVIEW } from "../apps/web/src/i18n/sentences";

type Row = [area: string, key: string, english: string, draft: string, note: string];
const rows: Row[] = [];

/**
 * Functions are shown with example values, so the reviewer sees a whole sentence. The example values are
 * chosen from the English function and given to both languages, so the two columns always show the same case.
 */
/** An example value for each parameter name used in the English texts. */
const EXAMPLE: Record<string, unknown> = {
  n: 3,
  total: 5,
  age: 7, // a number of years (the records age takes an object: see exampleArgs)
  days: 7,
  name: "Kevin",
  date: "2 June 2026",
  time: "14:30",
  by: "Dr. Diane Mukamana",
  code: "UB-7K2M",
  host: "ubuzima.wilsonn.tech",
  km: "2.4 km",
  d: "Gasabo",
  why: "the facility is full",
  phone: "0788 123 456",
  dose: "2 puffs",
  often: "when short of breath",
};
function exampleArgs(f: (...a: never[]) => unknown) {
  const src = String(f);
  if (/years\s*>=/.test(src)) return [{ years: 7, months: 84, days: 2550 }];
  if (src.includes("female")) return [true, "imyaka 7 / 7 years", "2 Kamena 2019"];
  const params = (src.match(/^\(?([^)=]*)\)?\s*=>/)?.[1] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return params.map((p) => {
    if (!(p in EXAMPLE)) throw new Error(`No example value for parameter "${p}" in ${src}`);
    return EXAMPLE[p];
  });
}
const call = (f: unknown, args: unknown[]) => String((f as (...a: unknown[]) => unknown)(...args));
function walk(e: unknown, r: unknown, path: string[]) {
  if (typeof e === "function") {
    const args = exampleArgs(e as never);
    rows.push([path[0], path.slice(1).join("."), call(e, args), call(r, args), "Example: the name or number changes"]);
    return;
  }
  if (typeof e === "string") {
    rows.push([path[0], path.slice(1).join("."), e, r as string, ""]);
    return;
  }
  for (const k of Object.keys(e as object))
    walk((e as Record<string, unknown>)[k], (r as Record<string, unknown>)[k], [...path, k]);
}
walk(en, rw, []);

for (const [english, draft] of Object.entries(SENTENCES_FOR_REVIEW.exact))
  rows.push(["server", "", english, draft, "From the server or a form check"]);

// The red-flag questions live in the database; the drafts are in the seed. Medical wording: check with a clinician too.
const seed = readFileSync(resolve(import.meta.dirname, "../apps/api/src/seed.ts"), "utf8");
const english = Object.fromEntries(
  // Short entries sit on one line, long ones are split over several by the formatter: allow any spacing.
  [...seed.matchAll(/code:\s*"(\w+)",\s*group:\s*"\w",\s*textEn:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
const drafts = Object.fromEntries(
  [...seed.matchAll(/^ {2}(\w+):\s*"([^"]+)",$/gm)].filter((m) => m[1] in english).map((m) => [m[1], m[2]]),
);
if (Object.keys(english).length !== 23)
  throw new Error(`Expected 23 red-flag questions in the seed, found ${Object.keys(english).length}`);
const missing = Object.keys(english).filter((code) => !drafts[code]);
if (missing.length) throw new Error(`No Kinyarwanda draft found for ${missing.join(", ")}`);
for (const code of Object.keys(english))
  rows.push(["red flag", code, english[code], drafts[code] ?? "", "Danger sign: also check with a clinician"]);

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csv = [
  ["Area", "Key", "English", "Kinyarwanda (draft)", "Correction", "Notes"],
  ...rows.map(([a, k, e, d, n]) => [a, k, e, d, "", n]),
]
  .map((r) => r.map(cell).join(","))
  .join("\n");
writeFileSync(resolve(import.meta.dirname, "../docs/translations/kinyarwanda-review.csv"), "﻿" + csv + "\n");
console.log(`${rows.length} texts written to docs/translations/kinyarwanda-review.csv`);
