import { Injectable } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { DbService } from "../common/db.service";
import { env } from "../common/env";
import { newToken, sha256 } from "../common/crypto";

/**
 * One cookie per app (DECISIONS.md D76), so a patient and a staff member can be logged in side by side in the
 * same browser, and one app's logout or idle timer never ends the other's session.
 */
export const COOKIES = { patient: "uc_patient", staff: "uc_staff" } as const;
export type App = keyof typeof COOKIES;
/** The cookie before D76: ignored, and cleared at logout. */
const LEGACY = "uc_session";

/**
 * Which app a request comes from, for routes either may call: the web app says so in x-uc-app (or ?as= for live
 * streams, which can't send headers). Without a hint, a valid staff session is used, then a patient one.
 */
export function appHint(req: Request): App | null {
  const h = req.header("x-uc-app") ?? (typeof req.query?.as === "string" ? req.query.as : undefined);
  return h === "staff" || h === "patient" ? h : null;
}
const idleMs = LIMITS.sessionIdleMinutes * 60_000;
/** Write lastSeenAt at most once a minute, not on every request. */
const touchEveryMs = 60_000;

type New =
  | { patientId: string; sharedDevice: boolean }
  | { staffId: string; verified: boolean; ttlMs?: number };

/**
 * Server-side sessions with an opaque cookie (DECISIONS.md D12). The cookie holds a random
 * token; the database keeps its hash. Each request moves the expiry 15 minutes ahead (FR 1.7, 2.5).
 */
@Injectable()
export class SessionService {
  constructor(private db: DbService) {}

  async create(res: Response, req: Request, data: New) {
    const token = newToken();
    const ttl = "ttlMs" in data && data.ttlMs ? data.ttlMs : idleMs;
    const session = await this.db.client.session.create({
      data: {
        tokenHash: sha256(token),
        patientId: "patientId" in data ? data.patientId : null,
        staffId: "staffId" in data ? data.staffId : null,
        verified: "patientId" in data ? true : data.verified,
        sharedDevice: "sharedDevice" in data ? data.sharedDevice : false,
        userAgent: req.header("user-agent")?.slice(0, 200),
        expiresAt: new Date(Date.now() + ttl),
      },
    });
    const app: App = "patientId" in data ? "patient" : "staff";
    res.cookie(COOKIES[app], token, {
      httpOnly: true,
      secure: env.prod,
      sameSite: "lax",
      path: "/",
      domain: env.cookieDomain,
      // FR 1.8: on a device that isn't theirs, the cookie ends when the browser closes.
      ...("sharedDevice" in data && data.sharedDevice ? {} : { maxAge: 12 * 60 * 60_000 }),
    });
    return session;
  }

  /** The live session for this request and app, or null. Slides the expiry forward. */
  async current(req: Request, app: App | "any" = "any") {
    if (app !== "any") return this.read(req, app);
    const hint = appHint(req);
    if (hint) return this.read(req, hint);
    return (await this.read(req, "staff")) ?? (await this.read(req, "patient"));
  }

  private async read(req: Request, app: App) {
    const token = req.cookies?.[COOKIES[app]];
    if (typeof token !== "string" || token.length < 20) return null;
    const session = await this.db.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { staff: { include: { facility: true } }, patient: true },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
    if ((app === "staff") !== !!session.staffId) return null; // a cookie under the wrong name is ignored
    if (session.verified && now - session.lastSeenAt.getTime() > touchEveryMs) {
      await this.db.client.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + idleMs) },
      });
    }
    return session;
  }

  /**
   * Why there is no live session behind this app's cookie, so the login page can say the right thing: a staff login
   * still waiting for its code ("unfinished"), one whose code ran out ("unfinished-expired"), a session that ended
   * after 15 idle minutes ("ended"), or one ended on purpose: logout, or a password change ("revoked").
   * Read-only: it never moves an expiry.
   */
  async state(req: Request, app: App): Promise<"live" | "unfinished" | "unfinished-expired" | "ended" | "revoked" | "none"> {
    const token = req.cookies?.[COOKIES[app]];
    if (typeof token !== "string" || token.length < 20) return "none";
    const session = await this.db.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: { verified: true, revokedAt: true, expiresAt: true, staffId: true },
    });
    if (!session || (app === "staff") !== !!session.staffId) return "none";
    if (session.revokedAt) return "revoked";
    const expired = session.expiresAt.getTime() <= Date.now();
    if (!session.verified) return expired ? "unfinished-expired" : "unfinished";
    return expired ? "ended" : "live";
  }

  verify(id: string) {
    const now = Date.now();
    return this.db.client.session.update({
      where: { id },
      data: { verified: true, lastSeenAt: new Date(now), expiresAt: new Date(now + idleMs) },
    });
  }

  /** Ends this app's session only; the other app's session in the same browser is left alone. */
  async end(req: Request, res: Response, app: App) {
    const token = req.cookies?.[COOKIES[app]];
    if (typeof token === "string") {
      await this.db.client.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(COOKIES[app], { path: "/", domain: env.cookieDomain });
    res.clearCookie(LEGACY, { path: "/", domain: env.cookieDomain });
  }

  /** After a password change every session ends, because the usual reason is fear that someone else knows it. */
  revokeAllForStaff(staffId: string) {
    return this.db.client.session.updateMany({ where: { staffId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}

export type LiveSession = NonNullable<Awaited<ReturnType<SessionService["current"]>>>;
