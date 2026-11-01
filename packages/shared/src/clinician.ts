import { z } from "zod";

/** Optional text: an empty box counts as not filled in. */
function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => value || undefined);
}

/** When the person arriving doesn't match their identity photo. */
export const arrivalIssue = z.object({
  note: z.string().trim().min(3, "Say what didn't match").max(1000),
});

/** A record entry: diagnosis, treatment and notes. At least one must be filled in. */
export const clinicalEntry = z
  .object({ diagnosis: optionalText(2000), treatment: optionalText(2000), notes: optionalText(4000) })
  .refine((entry) => entry.diagnosis || entry.treatment || entry.notes, {
    message: "Write a diagnosis, treatment or note",
    path: ["diagnosis"],
  });

/** Handing a patient over to another clinician. */
export const handover = z.object({ clinicianId: z.string().uuid("Choose a colleague") });

/** What ended a visit. */
export const VISIT_END_LABEL = { DISCHARGED: "Discharged", COMPLETED: "Completed", TRANSFERRED: "Transferred" } as const;
