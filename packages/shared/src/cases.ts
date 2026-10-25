import { z } from "zod";
import { DURATIONS } from "./triage";

const location = z.discriminatedUnion("source", [
  /** FR 3.3: from the device GPS, with permission */
  z.object({ source: z.literal("GPS"), latitude: z.number().min(-3).max(-0.9), longitude: z.number().min(28.7).max(31) }),
  /** FR 3.4: when GPS is unavailable or refused, the centre of the chosen sector */
  z.object({ source: z.literal("MANUAL"), sectorCode: z.string().regex(/^RW\d{4}$/, "Choose your sector") }),
]);
export type CaseLocation = z.infer<typeof location>;

/** FR 3.1, 3.2, 3.3, 3.4 */
export const startCase = z.object({ subjectId: z.string().uuid(), location });

export const redFlagAnswer = z.object({ questionId: z.string().uuid(), answer: z.boolean() });
/** The whole checklist on one screen: the danger sign tapped, or null for "None of these". */
export const redFlagChecklist = z.object({ yes: z.string().uuid().nullable() });
export const pregnancyAnswer = z.object({ pregnant: z.boolean() });

/** FR 3.7: own words, how long, how bad (1 to 10). */
export const symptoms = z.object({
  description: z.string().trim().min(1, "Describe the problem in your own words").max(2000, "Keep it under 2,000 characters"),
  duration: z.enum(DURATIONS, "Choose how long it has lasted"),
  severity: z.number().int().min(1, "Choose how bad it is").max(10),
});

/** FR 3.8, 3.9: a number to call and whose it is. Rwandan mobile numbers. */
export const PHONE_OWNERS = ["MINE", "FAMILY_MEMBER", "SOMEONE_ELSE"] as const;
export const PHONE_OWNER_LABEL = { MINE: "Mine", FAMILY_MEMBER: "A family member's", SOMEONE_ELSE: "Someone else's" } as const;
export const callRequest = z.object({
  number: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(\+?250|0)?7\d{8}$/, "Enter a Rwandan mobile number like 0788 123 456")),
  owner: z.enum(PHONE_OWNERS, "Choose whose number it is"),
});
export const homeCallRequest = callRequest.extend({ subjectId: z.string().uuid() });
