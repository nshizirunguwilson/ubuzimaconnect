import { z } from "zod";

// Prescriptions

/** How long a prescription is valid at pharmacies. */
export const PRESCRIPTION_VALID_DAYS = 7;

function requiredText(message: string, maxLength: number) {
  return z.string().trim().min(1, message).max(maxLength);
}

/** One medicine on a prescription. */
export const prescriptionItem = z.object({
  medicine: requiredText("Enter the medicine", 120),
  dose: requiredText("Enter the dose", 60),
  frequency: requiredText("Enter how often", 60),
  days: z.coerce
    .number({ error: "Enter the number of days" })
    .int("Whole days")
    .min(1, "At least 1 day")
    .max(90, "90 days at most"),
  instructions: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((value) => value || undefined),
});
export const prescription = z.object({
  items: z.array(prescriptionItem).min(1, "Add at least one medicine").max(10, "10 medicines at most"),
});
export type PrescriptionInput = z.infer<typeof prescription>;

export const cancelPrescription = z.object({
  reason: z.string().trim().min(3, "Say why it is cancelled").max(300),
});

export type PrescriptionStatus = "VALID" | "EXPIRED" | "CANCELLED";
export const PRESCRIPTION_STATUS_LABEL: Record<PrescriptionStatus, string> = {
  VALID: "Valid",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

/** Cancelled wins over Expired. Prescriptions are never deleted. */
export function prescriptionStatus(
  prescription: { validUntil: string | Date; cancelledAt: string | Date | null },
  now = new Date(),
): PrescriptionStatus {
  if (prescription.cancelledAt) return "CANCELLED";
  const expired = new Date(prescription.validUntil).getTime() <= now.getTime();
  return expired ? "EXPIRED" : "VALID";
}

/**
 * How a prescription code is printed and typed: "RX7K3M9QPD" or "rx-7k3m-9qpd" becomes "RX-7K3M-9QPD".
 * Also works on a code that is still being typed.
 */
export function formatPrescriptionCode(value: string) {
  const characters = value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/^RX/, "")
    .slice(0, 8);

  if (characters.length === 0) return "";
  if (characters.length <= 4) return `RX-${characters}`;
  return `RX-${characters.slice(0, 4)}-${characters.slice(4)}`;
}

// Activity log

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
  logout: "Logged out",
  "alert.repeated": "The administrator was alerted again",
  "staff.invited": "Invited a staff member",
  "staff.invitation.resent": "Sent the invitation again",
  "staff.deactivated": "Turned off a staff account",
  "staff.email.changed": "Changed a staff email",
  "staff.locked.email": "Account locked until the emailed code",
  "staff.unlocked": "Unlocked the account with the emailed code",
  "staff.reset.requested": "Asked for a password reset link",
  "clinician.invited": "Invited a clinician",
  "clinician.updated": "Updated a clinician",
  "clinician.deactivated": "Turned off a clinician account",
  "facility.created": "Added a facility",
  "facility.profile.updated": "Updated the facility profile",
  "facility.beds.updated": "Changed the bed count",
  "schedule.assigned": "Added a shift",
  "schedule.removed": "Removed a shift",
  "schedule.copied": "Copied last week's schedule",
  "redflag.added": "Added a red-flag question",
  "redflag.edited": "Edited a red-flag question",
  "redflag.removed": "Removed a red-flag question",
  "settings.ai.on": "Turned AI suggestions on",
  "settings.ai.off": "Turned AI suggestions off",
  "nida.person.added": "Added a person to the mock NIDA",
  "demo.reset": "Demo data reset",
};
export function actionLabel(action: string) {
  return ACTION_LABEL[action] ?? action.replace(/[._]/g, " ");
}

// Push notifications

/** A notification only says a message arrived: never a name, a symptom or anything medical. */
export const PUSH_TEXT = { title: "UbuzimaConnect", body: "You have a new message." } as const;
/** The same in Kinyarwanda, for patients who chose it. A draft: see the translation review sheet. */
export const PUSH_TEXT_RW = { title: "UbuzimaConnect", body: "Ufite ubutumwa bushya." } as const;

/** What the browser hands over once the person allows notifications (PushSubscription.toJSON()). */
export const pushSubscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});
