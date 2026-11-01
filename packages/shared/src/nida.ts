import { z } from "zod";
import { DISTRICTS } from "./catalog";
import { decodedSize, startsWithBytes } from "./files";
import { age } from "./triage";

/**
 * Adding a made-up person to the mock NIDA, so a facilitator can create their own patient to log in as.
 * The same rules run in the browser, the API and the mock NIDA itself.
 */
export const NIDA_PHOTO_MAX_BYTES = 1_000_000;
const ALL_DISTRICTS = Object.values(DISTRICTS).flat();
/** Letters in any script, with an apostrophe or hyphen inside a name: "N'Dayisaba", "Mukamana-Uwase". */
const NAME = /^\p{L}+(?:['’-]\p{L}+)*$/u;

/** Age in whole years of someone born on this YYYY-MM-DD date. */
export function nidaAge(dateOfBirth: string, now = new Date()) {
  return age(dateOfBirth, now).years;
}

/** People this age or older have their own ID card. Younger children are reached through a parent. */
export const NIDA_ID_AGE = 16;

/** True when this YYYY-MM-DD date exists on the calendar (so not 2026-02-30). */
function isRealDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(isoDate);
}

export const nidaPersonInput = z
  .object({
    names: z
      .string()
      .trim()
      .min(1, "Enter the names as on the ID card")
      .transform((typed) => typed.split(/\s+/))
      .pipe(
        z
          .array(z.string().max(30, "Each name can have up to 30 letters").regex(NAME, "Use letters only (an apostrophe or hyphen inside a name is fine)"))
          .min(2, "Enter at least two names, as on the ID card")
          .max(4, "Enter at most four names"),
      ),
    sex: z.enum(["FEMALE", "MALE"], "Choose the sex on the ID card"),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of birth")
      .refine(isRealDate, "This date doesn't exist")
      .refine((date) => new Date(`${date}T00:00:00Z`).getTime() <= Date.now(), "The date of birth can't be in the future")
      .refine((date) => nidaAge(date) <= 120, "Check the year: that would be over 120 years old"),
    district: z.string().refine((district) => ALL_DISTRICTS.includes(district), "Choose a district"),
    phone: z
      .string()
      .trim()
      .transform((typed) => typed.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^((\+?250|0)?7\d{8})?$/, "Enter a Rwandan mobile number like 0788 123 456"))
      .optional()
      .transform((phone) => phone || undefined),
    /** The parent's NIDA reference, e.g. NIDA-0001. Required for a child under 16. */
    parentRef: z
      .string()
      .trim()
      .regex(/^(NIDA-\d{4,6})?$/, "Choose a parent from the list")
      .optional()
      .transform((ref) => ref || undefined),
    /** A JPEG or PNG as a data URL; checked by its content, not only its name, in the API and the mock NIDA. */
    photo: z
      .string()
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/, "Use a JPG or PNG photo")
      .refine((dataUrl) => decodedSize(dataUrl) <= NIDA_PHOTO_MAX_BYTES, "The photo must be under 1 MB")
      .optional(),
  })
  .superRefine((person, ctx) => {
    if (nidaAge(person.dateOfBirth) < NIDA_ID_AGE && !person.parentRef) {
      ctx.addIssue({ code: "custom", path: ["parentRef"], message: `A child under ${NIDA_ID_AGE} has no ID card: choose a parent` });
    }
  });
export type NidaPersonInput = z.infer<typeof nidaPersonInput>;

/** The real file type of an uploaded photo, from its first bytes; null when it is neither JPEG nor PNG. */
export function photoType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

