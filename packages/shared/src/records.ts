import { z } from "zod";

// ---------- Prescriptions (FR 11) ----------

/** FR 11.2: valid at pharmacies for 7 days. */
export const PRESCRIPTION_VALID_DAYS = 7;

const required = (what: string, max: number) => z.string().trim().min(1, what).max(max);

/** FR 11.1: medicine, dose, how often, how many days, instructions. */
export const prescriptionItem = z.object({
  medicine: required("Enter the medicine", 120),
  dose: required("Enter the dose", 60),
  frequency: required("Enter how often", 60),
  days: z.coerce.number({ error: "Enter the number of days" }).int("Whole days").min(1, "At least 1 day").max(90, "90 days at most"),
  instructions: z.string().trim().max(300).optional().transform((v) => v || undefined),
});
export const prescription = z.object({
  items: z.array(prescriptionItem).min(1, "Add at least one medicine").max(10, "10 medicines at most"),
});
export type PrescriptionInput = z.infer<typeof prescription>;

export const cancelPrescription = z.object({ reason: z.string().trim().min(3, "Say why it is cancelled").max(300) });

export type PrescriptionStatus = "VALID" | "EXPIRED" | "CANCELLED";
export const PRESCRIPTION_STATUS_LABEL: Record<PrescriptionStatus, string> = { VALID: "Valid", EXPIRED: "Expired", CANCELLED: "Cancelled" };

/** FR 11.3, 11.4: Cancelled wins over Expired; nothing is ever deleted. */
export function prescriptionStatus(p: { validUntil: string | Date; cancelledAt: string | Date | null }, now = new Date()): PrescriptionStatus {
  if (p.cancelledAt) return "CANCELLED";
  return new Date(p.validUntil).getTime() <= now.getTime() ? "EXPIRED" : "VALID";
}

/** "RX7K3M9QPD" or "rx-7k3m-9qpd" → "RX-7K3M-9QPD": how the code is printed and typed. */
export function formatPrescriptionCode(value: string) {
  const c = value.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^RX/, "").slice(0, 8);
  return c.length > 4 ? `RX-${c.slice(0, 4)}-${c.slice(4)}` : c ? `RX-${c}` : "";
}

// ---------- Activity (FR 10.2, 10.3) ----------

/** What each logged action means, in plain words. Unknown actions fall back to their name. */
export const ACTION_LABEL: Record<string, string> = {
  "patient.login": "Logged in",
  "patient.login.failed": "Failed login",
  "staff.login": "Logged in",
  "staff.login.failed": "Failed login",
  "case.started": "Started a request for help",
  "case.submitted": "Sent the request",
  "case.redflag.yes": "Answered Yes to a danger sign",
  "case.call.requested": "Asked for a call",
  "case.accepted": "A health agent took the request",
  "case.call": "Called the patient",
  "case.released": "Gave the request back to the queue",
  "case.paused": "Paused the request for an emergency",
  "case.closed": "Closed the request",
  "case.cancelled": "Cancelled the request",
  "case.rated": "Rated the help",
  "triage.confirmed": "Reviewed the triage",
  "routing.suggested": "Nearest facility given",
  "routing.confirmed": "Confirmed where to go",
  "routing.changed": "Changed where to go",
  "routing.no_beds": "No free bed nearby",
  "routing.no_match": "No facility could take the case",
  "routing.no_clinician": "No clinician of that specialty on duty",
  "routing.clinician_assigned": "Clinician assigned",
  "routing.clinician_reassigned": "Another clinician assigned",
  "shift.unavailable": "Marked unavailable for a shift",
  "shift.available": "Marked available again",
  "bed.reserved": "Bed held",
  "bed.released": "Bed released",
  "bed.assigned": "Bed assigned",
  "bed.none_free": "No bed was free",
  "record.viewed": "Opened the record",
  "record.entry_added": "Added to the record",
  "record.entry_updated": "Updated the record",
  "records.viewed": "Opened the records",
  "patient.arrived": "Arrived at the facility",
  "arrival.mismatch": "Photo check didn't match",
  "patient.handed_over": "Handed over to another clinician",
  "patient.transferred": "Transferred to another facility",
  "patient.discharged": "Discharged",
  "visit.completed": "Visit completed",
  "prescription.issued": "Issued a prescription:",
  "prescription.cancelled": "Cancelled a prescription:",
  "prescription.checked": "Checked at a pharmacy:",
  "ai.failure": "AI suggestion unavailable",
  "agent.status": "Changed status",
  "agent.lost_connection": "Lost connection",
  "push.on": "Turned on notifications",
  "report.downloaded": "Downloaded a report",
  "routing.expired": "The facility stopped expecting the patient",
  "case.escalated": "Waited more than 2 minutes for an agent",
  "case.delay_incident": "Waited more than 5 minutes for an agent",
  "alert.raised": "The administrator was alerted",
  "nida.unavailable": "ID check unavailable",
};
export const actionLabel = (action: string) => ACTION_LABEL[action] ?? action.replace(/[._]/g, " ");

// ---------- Push notifications (FR 6.6, NFR 13) ----------

/** NFR 13: a notification only says a message arrived; never a name, symptom or anything medical. */
export const PUSH_TEXT = { title: "UbuzimaConnect", body: "You have a new message." } as const;
/** The same in Kinyarwanda, for patients who chose it (NFR 7). DRAFT: see the review sheet. */
export const PUSH_TEXT_RW = { title: "UbuzimaConnect", body: "Ufite ubutumwa bushya." } as const;

/** What the browser hands over after the person agrees (Push API PushSubscription.toJSON()). */
export const pushSubscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});
