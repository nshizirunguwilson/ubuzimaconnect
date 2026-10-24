import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

/** FR 7.5: the arriving person doesn't match the identity photo. */
export const arrivalIssue = z.object({ note: z.string().trim().min(3, "Say what didn't match").max(1000) });

/** FR 7.7: diagnosis, treatment and notes; at least one of them. */
export const clinicalEntry = z
  .object({ diagnosis: text(2000), treatment: text(2000), notes: text(4000) })
  .refine((e) => e.diagnosis || e.treatment || e.notes, { message: "Write a diagnosis, treatment or note", path: ["diagnosis"] });

/** FR 7.11 */
export const handover = z.object({ clinicianId: z.string().uuid("Choose a colleague") });

/** What ended a visit (FR 7.9, 7.10), as the SRS routing states name it. */
export const VISIT_END_LABEL = { DISCHARGED: "Discharged", COMPLETED: "Completed", TRANSFERRED: "Transferred" } as const;
