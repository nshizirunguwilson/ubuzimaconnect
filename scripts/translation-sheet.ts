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

/** Functions are shown with an example value, so the reviewer sees a whole sentence. */
function example(f: (...a: never[]) => unknown) {
  const src = String(f);
  const args = src.includes("years >=") ? [{ years: 7, months: 84, days: 2550 }] : src.includes("female") ? [true, "imyaka 7 / 7 years", "2 Kamena 2019"] : Array.from({ length: f.length || 1 }, (_, i) => (/\bn\b|days|age|total/.test(src) && i < 2 ? 3 : "Kevin"));
  return String((f as (...a: unknown[]) => unknown)(...args));
}
function walk(e: unknown, r: unknown, path: string[]) {
  if (typeof e === "string" || typeof e === "function") {
    const isFn = typeof e === "function";
    rows.push([path[0], path.slice(1).join("."), isFn ? example(e as never) : (e as string), isFn ? example(r as never) : (r as string), isFn ? "Example: the name or number changes" : ""]);
    return;
  }
  for (const k of Object.keys(e as object)) walk((e as Record<string, unknown>)[k], (r as Record<string, unknown>)[k], [...path, k]);
}
walk(en, rw, []);

for (const [english, draft] of Object.entries(SENTENCES_FOR_REVIEW.exact)) rows.push(["server", "", english, draft, "From the server or a form check"]);

// The red-flag questions live in the database; the drafts are in the seed. Medical wording: check with a clinician too.
const seed = readFileSync(resolve(import.meta.dirname, "../apps/api/src/seed.ts"), "utf8");
const english = Object.fromEntries([...seed.matchAll(/code: "(\w+)", group: "\w", textEn: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
const drafts = Object.fromEntries([...seed.matchAll(/^ {2}(\w+): "([^"]+)",$/gm)].filter((m) => m[1] in english).map((m) => [m[1], m[2]]));
for (const code of Object.keys(english)) rows.push(["red flag", code, english[code], drafts[code] ?? "", "Danger sign: also check with a clinician"]);

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
const csv = [["Area", "Key", "English", "Kinyarwanda (draft)", "Correction", "Notes"], ...rows.map(([a, k, e, d, n]) => [a, k, e, d, "", n])].map((r) => r.map(cell).join(",")).join("\n");
writeFileSync(resolve(import.meta.dirname, "../docs/translations/kinyarwanda-review.csv"), "﻿" + csv + "\n");
console.log(`${rows.length} texts written to docs/translations/kinyarwanda-review.csv`);
