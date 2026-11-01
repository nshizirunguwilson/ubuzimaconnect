/**
 * Security limits. The API enforces them; the web app only uses them to explain what happens.
 */
export const LIMITS = {
  /** Sessions end after 15 minutes without activity. */
  sessionIdleMinutes: 15,
  /** Failed attempts before a 15-minute lock. */
  maxFailedAttempts: 5,
  lockMinutes: 15,
  /** How long the emailed login code works. */
  loginCodeMinutes: 5,
  /** How long the unlock code works, sent after a second lock. */
  unlockCodeMinutes: 15,
  /** How long a staff invitation link works. */
  invitationHours: 48,
  /** How long a password reset link works. */
  resetLinkMinutes: 30,
  /** Wrong tries allowed on one emailed code before it is cancelled. */
  codeMaxTries: 5,
  /** How long we wait for NIDA before saying it is unavailable. */
  nidaTimeoutMs: 4000,
} as const;
