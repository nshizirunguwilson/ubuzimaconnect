import { z } from "zod";
import { SERVICES } from "./catalog";
import { CATEGORIES } from "./triage";

export const AGENT_STATUSES = ["AVAILABLE", "BUSY", "AWAY", "OFFLINE"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = { AVAILABLE: "Available", BUSY: "Busy", AWAY: "Away", OFFLINE: "Offline" };

/** FR 6.1: Busy is set by the system, never chosen. */
export const agentStatusChange = z.object({ status: z.enum(["AVAILABLE", "AWAY", "OFFLINE"]) });

/** FR 6.5: the agent confirms or changes these. */
export const triageReview = z.object({
  triageLevel: z.enum(["URGENT", "UNCERTAIN", "MINOR"]),
  category: z.enum(CATEGORIES).nullable(),
  neededService: z.enum(SERVICES),
  bedNeeded: z.boolean(),
});

/** FR 6.6: quick replies (the SRS names Yes, No, Better, Worse). */
export const QUICK_REPLIES = ["Yes", "No", "Better", "Worse", "Same", "I don't know"] as const;
export const chatMessage = z.object({ text: z.string().trim().min(1, "Write a message").max(2000) });

/** FR 6.7: one call attempt. */
export const callNote = z.object({
  answered: z.boolean(),
  dobConfirmed: z.boolean().default(false),
  note: z.string().trim().min(3, "Write a short call note").max(2000),
});

/** FR 5.6, 5.12: confirm a facility and attending clinician. */
export const routingChoice = z.object({
  facilityId: z.string().uuid(),
  bedNeeded: z.boolean(),
  reason: z.string().trim().max(300).optional(),
  clinicianId: z.string().uuid().optional(),
  clinicianReason: z.string().trim().max(300).optional(),
});

/** FR 6.15 */
export const OUTCOMES = ["ADVISED_REMOTELY", "PRESCRIPTION_ISSUED", "ROUTED_TO_FACILITY", "REFERRED_TO_912", "NO_RESPONSE"] as const;
export const OUTCOME_LABEL: Record<(typeof OUTCOMES)[number] | "CANCELLED_BY_PATIENT", string> = {
  ADVISED_REMOTELY: "Advised remotely",
  PRESCRIPTION_ISSUED: "Prescription issued",
  ROUTED_TO_FACILITY: "Routed to facility",
  REFERRED_TO_912: "Referred to 912",
  NO_RESPONSE: "No response",
  CANCELLED_BY_PATIENT: "Cancelled by patient",
};
export const closeCase = z.object({
  outcome: z.enum(OUTCOMES, "Choose the outcome"),
  note: z.string().trim().min(3, "Write a closing note").max(2000),
});

export const rating = z.object({ rating: z.number().int().min(1).max(5) });

/** Live events sent over Server-Sent Events. */
export type LiveEvent =
  | { type: "message"; caseId: string; message: { id: string; sender: "PATIENT" | "AGENT" | "SYSTEM"; text: string; createdAt: string; staffName?: string | null } }
  | { type: "case"; caseId: string }
  | { type: "offer"; caseId: string; expiresAt: string }
  | { type: "offer-ended"; caseId: string }
  | { type: "queue" }
  // A clinician's facility: an incoming patient was added, arrived or left the list (FR 7.4)
  | { type: "incoming" }
  // FR 5.12, 7.11: a patient was given or handed over to this clinician
  | { type: "notice"; kind: "INCOMING" | "HANDOVER"; routingId: string }
  // FR 5.13: the agent must choose another facility for a case
  | { type: "alert"; caseId: string; text: string }
  // FR 12.7: an alert for the administrator
  | { type: "admin-alert"; kind: string; text: string };
