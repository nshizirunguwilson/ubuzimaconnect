import { z } from "zod";
import { DURATIONS } from "./triage";

/** Where the patient is: from the phone's GPS, or, when that is refused or unavailable, the sector they choose. */
const location = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("GPS"),
    latitude: z.number().min(-3).max(-0.9),
    longitude: z.number().min(28.7).max(31),
  }),
  z.object({
    source: z.literal("MANUAL"),
    sectorCode: z.string().regex(/^RW\d{4}$/, "Choose your sector"),
  }),
]);
export type CaseLocation = z.infer<typeof location>;

/** Starting a request for help: who is sick, and where they are. */
export const startCase = z.object({ subjectId: z.string().uuid(), location });

export const redFlagAnswer = z.object({ questionId: z.string().uuid(), answer: z.boolean() });
/** The danger-sign checklist on one screen: the sign tapped, or null for "None of these". */
export const redFlagChecklist = z.object({ yes: z.string().uuid().nullable() });
export const pregnancyAnswer = z.object({ pregnant: z.boolean() });

/** The problem in the patient's own words, how long it has lasted and how bad it is (1 to 10). */
export const symptoms = z.object({
  description: z.string().trim().min(1, "Describe the problem in your own words").max(2000, "Keep it under 2,000 characters"),
  duration: z.enum(DURATIONS, "Choose how long it has lasted"),
  severity: z.number().int().min(1, "Choose how bad it is").max(10),
});

/** A Rwandan mobile number to call the patient on, and whose number it is. */
export const PHONE_OWNERS = ["MINE", "FAMILY_MEMBER", "SOMEONE_ELSE"] as const;
export const PHONE_OWNER_LABEL = {
  MINE: "Mine",
  FAMILY_MEMBER: "A family member's",
  SOMEONE_ELSE: "Someone else's",
} as const;

export const callRequest = z.object({
  number: z
    .string()
    .transform((typed) => typed.replace(/[\s-]/g, "")) // "0788 123-456" becomes "0788123456"
    .pipe(z.string().regex(/^(\+?250|0)?7\d{8}$/, "Enter a Rwandan mobile number like 0788 123 456")),
  owner: z.enum(PHONE_OWNERS, "Choose whose number it is"),
});
export const homeCallRequest = callRequest.extend({ subjectId: z.string().uuid() });
