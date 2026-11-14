import { Injectable } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import type { CookieOptions, Request, Response } from "express";
import { newToken, sha256 } from "../common/crypto";
import { DbService } from "../common/db.service";
import { env } from "../common/env";

/**
 * One cookie per app, so a patient and a staff member can be logged in side by side in the same browser,
 * and one app's logout or idle timer never ends the other's session.
 */
export const COOKIES = { patient: "uc_patient", staff: "uc_staff" } as const;
export type App = keyof typeof COOKIES;

/** The single cookie used before each app had its own. It is ignored, and cleared at logout. */
const OLD_SHARED_COOKIE = "uc_session";

const IDLE_TIMEOUT_MS = LIMITS.sessionIdleMinutes * 60_000;
/** lastSeenAt is written at most once a minute, not on every request. */
const TOUCH_EVERY_MS = 60_000;
/** A cookie lives at most this long in the browser; the session itself still ends after 15 idle minutes. */
const COOKIE_MAX_AGE_MS = 12 * 60 * 60_000;
/** Real tokens are 43 characters. Anything much shorter is not worth a database lookup. */
const MIN_TOKEN_LENGTH = 20;

export type SessionState = "live" | "unfinished" | "unfinished-expired" | "ended" | "revoked" | "none";

type NewSession = { patientId: string; sharedDevice: boolean } | { staffId: string; verified: boolean; ttlMs?: number };

/**
 * Which app a request comes from, for the routes both apps call. The web app says so in the x-uc-app header,
 * or in ?as= for live streams, which can't send headers. Null when the request doesn't say.
 */
export function appHint(request: Request): App | null {
  const fromQuery = typeof request.query?.as === "string" ? request.query.as : undefined;
  const hint = request.header("x-uc-app") ?? fromQuery;
  if (hint === "staff" || hint === "patient") return hint;
  return null;
}

/** This app's session token from the request's cookies, or null when there isn't a usable one. */
function tokenFrom(request: Request, app: App): string | null {
  const token = request.cookies?.[COOKIES[app]];
  if (typeof token !== "string" || token.length < MIN_TOKEN_LENGTH) return null;
  return token;
}

/**
 * Sessions are kept on the server. The cookie holds only a random token, and the database keeps its hash.
 * Each request moves the expiry 15 minutes ahead, so a session ends after 15 minutes without activity.
 */
@Injectable()
export class SessionService {
  constructor(private db: DbService) {}

  async create(response: Response, request: Request, details: NewSession) {
    const token = newToken();
    const isPatient = "patientId" in details;
    const lifetimeMs = !isPatient && details.ttlMs ? details.ttlMs : IDLE_TIMEOUT_MS;

    const session = await this.db.client.session.create({
      data: {
        tokenHash: sha256(token),
        patientId: isPatient ? details.patientId : null,
        staffId: isPatient ? null : details.staffId,
        // A patient is verified by NIDA at once; a staff member only after the emailed code.
        verified: isPatient ? true : details.verified,
        sharedDevice: isPatient ? details.sharedDevice : false,
        userAgent: request.header("user-agent")?.slice(0, 200),
        expiresAt: new Date(Date.now() + lifetimeMs),
      },
    });

    const cookie: CookieOptions = {
      httpOnly: true,
      secure: env.prod,
      sameSite: "lax",
      path: "/",
      domain: env.cookieDomain,
    };
    // On a device that isn't theirs, the cookie has no max age, so it ends when the browser closes.
    const onSharedDevice = isPatient && details.sharedDevice;
    if (!onSharedDevice) cookie.maxAge = COOKIE_MAX_AGE_MS;

    response.cookie(COOKIES[isPatient ? "patient" : "staff"], token, cookie);
    return session;
  }

  /**
   * The live session for this request, or null. With app "any", the app the request names is used;
   * when it names none, a staff session is tried first, then a patient one. Reading a session keeps it alive.
   */
  async current(request: Request, app: App | "any" = "any") {
    if (app !== "any") return this.read(request, app);

    const hint = appHint(request);
    if (hint) return this.read(request, hint);

    const staffSession = await this.read(request, "staff");
    if (staffSession) return staffSession;
    return this.read(request, "patient");
  }

  private async read(request: Request, app: App) {
    const token = tokenFrom(request, app);
    if (!token) return null;

    const session = await this.db.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { staff: { include: { facility: true } }, patient: true },
    });
    const now = Date.now();

    if (!session || session.revokedAt) return null;
    if (session.expiresAt.getTime() <= now) return null;

    // A staff session under the patient cookie, or the reverse, is ignored.
    const isStaffSession = session.staffId !== null;
    if (isStaffSession !== (app === "staff")) return null;

    const dueForTouch = now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS;
    if (session.verified && dueForTouch) {
      await this.db.client.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + IDLE_TIMEOUT_MS) },
      });
    }
    return session;
  }

  /**
   * Why there is no live session behind this app's cookie, so the login page can say the right thing:
   * - "unfinished": a staff login still waiting for its emailed code
   * - "unfinished-expired": one whose code ran out
   * - "ended": a session that ended after 15 idle minutes
   * - "revoked": one ended on purpose (logout, or a password change)
   * Read-only: unlike current(), it never moves an expiry.
   */
  async state(request: Request, app: App): Promise<SessionState> {
    const token = tokenFrom(request, app);
    if (!token) return "none";

    const session = await this.db.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: { verified: true, revokedAt: true, expiresAt: true, staffId: true },
    });
    if (!session) return "none";

    const isStaffSession = session.staffId !== null;
    if (isStaffSession !== (app === "staff")) return "none";
    if (session.revokedAt) return "revoked";

    const expired = session.expiresAt.getTime() <= Date.now();
    if (!session.verified) return expired ? "unfinished-expired" : "unfinished";
    return expired ? "ended" : "live";
  }

  /** Completes a staff login once the emailed code is right. */
  verify(sessionId: string) {
    const now = Date.now();
    return this.db.client.session.update({
      where: { id: sessionId },
      data: { verified: true, lastSeenAt: new Date(now), expiresAt: new Date(now + IDLE_TIMEOUT_MS) },
    });
  }

  /** Ends this app's session only. The other app's session in the same browser is left alone. */
  async end(request: Request, response: Response, app: App) {
    const token = request.cookies?.[COOKIES[app]];
    if (typeof token === "string") {
      await this.db.client.session.updateMany({
        where: { tokenHash: sha256(token) },
        data: { revokedAt: new Date() },
      });
    }
    response.clearCookie(COOKIES[app], { path: "/", domain: env.cookieDomain });
    response.clearCookie(OLD_SHARED_COOKIE, { path: "/", domain: env.cookieDomain });
  }

  /** After a password change every session ends, because the usual reason is fear that someone else knows it. */
  revokeAllForStaff(staffId: string) {
    return this.db.client.session.updateMany({
      where: { staffId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export type LiveSession = NonNullable<Awaited<ReturnType<SessionService["current"]>>>;
