import { z } from "zod";
import { SERVICES } from "./catalog";
import { decodedSize, startsWithBytes } from "./files";
import { CATEGORIES } from "./triage";

export const AGENT_STATUSES = ["AVAILABLE", "BUSY", "AWAY", "OFFLINE"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  AVAILABLE: "Available",
  BUSY: "Busy",
  AWAY: "Away",
  OFFLINE: "Offline",
};

/** The statuses an agent can choose. Busy is set by the system while they work a case. */
export const agentStatusChange = z.object({ status: z.enum(["AVAILABLE", "AWAY", "OFFLINE"]) });

/** The triage the agent confirms or changes. */
export const triageReview = z.object({
  triageLevel: z.enum(["URGENT", "UNCERTAIN", "MINOR"]),
  category: z.enum(CATEGORIES).nullable(),
  neededService: z.enum(SERVICES),
  bedNeeded: z.boolean(),
});

/** One-tap answers the patient can send in the chat. */
export const QUICK_REPLIES = ["Yes", "No", "Better", "Worse", "Same", "I don't know"] as const;
export const chatMessage = z.object({ text: z.string().trim().min(1, "Write a message").max(2000) });

/** The longest voice note: 2 minutes. */
export const VOICE_MAX_MS = 120_000;
/** 2 minutes at 32 kbit/s is about 480 kB. Safari may record at a higher rate, so room is left for that. */
export const VOICE_MAX_BYTES = 2_500_000;
/** The browser's timer can run a little past the limit before the recording stops. */
const VOICE_TIMER_SLACK_MS = 2_000;

const AUDIO_DATA_URL = /^data:audio\/(webm|ogg|mp4|mpeg)(;codecs=[\w.,-]+)?;base64,[A-Za-z0-9+/]+=*$/;

/** A recorded voice note, sent as a data URL. The API also checks the file's real type with audioType. */
export const voiceNote = z.object({
  audio: z
    .string()
    .regex(AUDIO_DATA_URL, "Record the voice note again")
    .refine((dataUrl) => decodedSize(dataUrl) <= VOICE_MAX_BYTES, "The voice note is too long"),
  durationMs: z
    .number()
    .int()
    .min(500, "Hold a little longer to record")
    .max(VOICE_MAX_MS + VOICE_TIMER_SLACK_MS, "Voice notes can be up to 2 minutes"),
});

type AudioType = "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/mpeg";

/**
 * The real type of an audio file, read from its first bytes (its "signature"), so a file can't pretend
 * to be audio by its name alone. Null for anything that isn't WebM, Ogg, MP4 or MP3.
 */
export function audioType(bytes: Uint8Array): AudioType | null {
  if (startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (startsWithBytes(bytes, [0x4f, 0x67, 0x67, 0x53])) return "audio/ogg"; // "OggS"
  if (startsWithBytes(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "audio/mp4"; // "ftyp" after a 4-byte size

  const hasId3Tag = startsWithBytes(bytes, [0x49, 0x44, 0x33]); // "ID3"
  const isMp3Frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (hasId3Tag || isMp3Frame) return "audio/mpeg";

  return null;
}

/** One attempt to call the patient. */
export const callNote = z.object({
  answered: z.boolean(),
  dobConfirmed: z.boolean().default(false),
  note: z.string().trim().min(3, "Write a short call note").max(2000),
});

/** The agent's choice of facility and, optionally, the clinician who will receive the patient. */
export const routingChoice = z.object({
  facilityId: z.string().uuid(),
  bedNeeded: z.boolean(),
  reason: z.string().trim().max(300).optional(),
  clinicianId: z.string().uuid().optional(),
  clinicianReason: z.string().trim().max(300).optional(),
});

/** How a case ended. */
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

/** The patient's rating of the help, 1 to 5 stars. */
export const rating = z.object({ rating: z.number().int().min(1).max(5) });

export type LiveMessage = {
  id: string;
  sender: "PATIENT" | "AGENT" | "SYSTEM";
  text: string;
  createdAt: string;
  staffName?: string | null;
  audioMs?: number | null;
};

/** The live updates the API pushes to browsers (Server-Sent Events). */
export type LiveEvent =
  | { type: "message"; caseId: string; message: LiveMessage }
  | { type: "case"; caseId: string }
  | { type: "offer"; caseId: string; expiresAt: string }
  | { type: "offer-ended"; caseId: string }
  | { type: "queue" }
  // An incoming patient was added to a facility's list, arrived, or left it
  | { type: "incoming" }
  // A patient was given or handed over to this clinician
  | { type: "notice"; kind: "INCOMING" | "HANDOVER"; routingId: string }
  // The agent must choose another facility for a case
  | { type: "alert"; caseId: string; text: string }
  // An alert for the administrator
  | { type: "admin-alert"; kind: string; text: string };
