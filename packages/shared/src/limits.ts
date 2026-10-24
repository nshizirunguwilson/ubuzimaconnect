/**
 * Security limits from the SRS (NFR 6 and FR 1.6, 1.7, 2.2 to 2.7).
 * The API enforces them; the web app only uses them to explain what happens.
 */
export const LIMITS = {
  /** FR 1.7, 2.5: sessions end after 15 minutes without activity. */
  sessionIdleMinutes: 15,
  /** FR 1.6, 2.3: failed attempts before a 15-minute lock. */
  maxFailedAttempts: 5,
  lockMinutes: 15,
  /** FR 2.2: the login code sent by email. */
  loginCodeMinutes: 5,
  /** FR 2.4: the unlock code after a second lock. */
  unlockCodeMinutes: 15,
  /** FR 2.6: staff invitation link. */
  invitationHours: 48,
  /** FR 2.7: password reset link. */
  resetLinkMinutes: 30,
  /** Wrong tries allowed on one emailed code before it is cancelled. */
  codeMaxTries: 5,
  /** FR 1.5: how long we wait for NIDA before saying it is unavailable. */
  nidaTimeoutMs: 4000,
} as const;
