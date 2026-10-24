import type { StaffRole } from "./schemas";

/** Error codes the API returns, so the web app can show the right sentence (DESIGN.md §10). */
export type ApiErrorCode =
  | "VALIDATION"
  | "INVALID_CREDENTIALS"
  | "LOCKED"
  | "LOCKED_EMAIL_UNLOCK"
  | "NIDA_UNAVAILABLE"
  | "CODE_INVALID"
  | "CODE_EXPIRED"
  | "TOKEN_INVALID"
  | "DEACTIVATED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  /** FR 7.8: no free bed; the screen offers a transfer */
  | "NO_BED";

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  /** For LOCKED: when the lock ends (ISO). */
  until?: string;
  fields?: Record<string, string>;
};

export type FamilyMember = { id: string; name: string; relation: "CHILD"; age: number; photoUrl: string | null };

export type PatientMe = {
  kind: "patient";
  id: string;
  name: string;
  firstName: string;
  photoUrl: string | null;
  district: string | null;
  sharedDevice: boolean;
  family: FamilyMember[];
};

export type StaffMe = {
  kind: "staff";
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  facility: { id: string; name: string } | null;
};

export type Me = PatientMe | StaffMe;
