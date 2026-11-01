import { z } from "zod";

/**
 * Rwandan national ID: 16 digits in six parts, as printed on the card: 1 1987 8 0592371 0 64.
 * Nationality (1 Rwandan, 2 refugee, 3 foreign resident), birth year, sex (8 male, 7 female),
 * birth-order number, how many times the card was issued, and two check digits (NIDA).
 */
export const NID_PARTS = [1, 4, 1, 7, 1, 2] as const;

/** "1198780592371064" becomes "1 1987 8 0592371 0 64". Also works while the person is still typing. */
export function formatNationalId(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  const parts: string[] = [];
  let position = 0;

  for (const partLength of NID_PARTS) {
    if (position >= digits.length) break;
    parts.push(digits.slice(position, position + partLength));
    position += partLength;
  }
  return parts.join(" ");
}

export const nationalId = z
  .string()
  .transform((typed) => typed.replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\d{16}$/, "Enter the 16 digits on the front of the ID card")
      .regex(/^[123]\d{4}[78]\d{10}$/, "This isn't a Rwandan ID number. Check the digits on the card."),
  );

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");

/** A patient logs in with their national ID, date of birth and one of their names. */
export const patientLogin = z.object({
  nationalId,
  dateOfBirth: isoDate,
  name: z.string().trim().min(2, "Enter one of your names").max(60),
  /** "This is not my device": no notifications, and nothing stays on the device after logout. */
  sharedDevice: z.boolean().default(false),
});
export type PatientLogin = z.infer<typeof patientLogin>;

export const email = z.string().trim().toLowerCase().email("Enter an email address like name@example.com");

export const staffLogin = z.object({ email, password: z.string().min(1, "Enter your password") });
export type StaffLogin = z.infer<typeof staffLogin>;

export const emailCode = z.object({
  code: z
    .string()
    .transform((typed) => typed.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email")),
});

/**
 * At least 8 characters, with no rules about which characters. NIST SP 800-63B-4 sets 8 as the minimum when the
 * password is one of two factors, and staff also enter an emailed code.
 */
export const newPassword = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use 128 characters or fewer");

export const setPassword = z.object({ token: z.string().min(20), password: newPassword });
export const resetRequest = z.object({ email });
export const unlockRequest = z.object({ email, code: emailCode.shape.code });

/** The four staff roles. Pharmacists have no account: they use the public prescription check page. */
export const STAFF_ROLES = ["AGENT", "CLINICIAN", "FACILITY_MANAGER", "ADMIN"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  AGENT: "Health agent",
  CLINICIAN: "Clinician",
  FACILITY_MANAGER: "Facility manager",
  ADMIN: "System administrator",
};

/** The administrator invites agents and facility managers. Clinicians are invited by their facility manager. */
export const ADMIN_INVITE_ROLES = ["AGENT", "FACILITY_MANAGER"] as const;

export const invitation = z
  .object({
    name: z.string().trim().min(2, "Enter the full name").max(80),
    email,
    role: z.enum(ADMIN_INVITE_ROLES, "Choose a role"),
    facilityId: z.string().uuid().optional(),
    licenceNumber: z.string().trim().max(40).optional(),
  })
  .superRefine((invite, ctx) => {
    if (invite.role === "AGENT" && !invite.licenceNumber) {
      ctx.addIssue({ code: "custom", path: ["licenceNumber"], message: "Enter the agent's licence number" });
    }
    if (invite.role === "FACILITY_MANAGER" && !invite.facilityId) {
      ctx.addIssue({ code: "custom", path: ["facilityId"], message: "Choose the facility this person manages" });
    }
  });
export type Invitation = z.infer<typeof invitation>;

/** The name used in greetings: "Dr. Samuel Mugisha" becomes "Samuel". */
export function greetingName(fullName: string) {
  const withoutTitle = fullName.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "");
  return withoutTitle.split(/\s+/)[0];
}
