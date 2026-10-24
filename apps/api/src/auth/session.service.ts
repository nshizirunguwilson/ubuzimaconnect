import { Injectable } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { DbService } from "../common/db.service";
import { env } from "../common/env";
import { newToken, sha256 } from "../common/crypto";

export const COOKIE = "uc_session";
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
    res.cookie(COOKIE, token, {
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

  /** The live session for this request, or null. Slides the expiry forward. */
  async current(req: Request) {
    const token = req.cookies?.[COOKIE];
    if (typeof token !== "string" || token.length < 20) return null;
    const session = await this.db.client.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { staff: { include: { facility: true } }, patient: true },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
    if (session.verified && now - session.lastSeenAt.getTime() > touchEveryMs) {
      await this.db.client.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + idleMs) },
      });
    }
    return session;
  }

  verify(id: string) {
    const now = Date.now();
    return this.db.client.session.update({
      where: { id },
      data: { verified: true, lastSeenAt: new Date(now), expiresAt: new Date(now + idleMs) },
    });
  }

  async end(req: Request, res: Response) {
    const token = req.cookies?.[COOKIE];
    if (typeof token === "string") {
      await this.db.client.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
    }
    res.clearCookie(COOKIE, { path: "/", domain: env.cookieDomain });
  }

  /** After a password change every session ends, because the usual reason is fear that someone else knows it. */
  revokeAllForStaff(staffId: string) {
    return this.db.client.session.updateMany({ where: { staffId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}

export type LiveSession = NonNullable<Awaited<ReturnType<SessionService["current"]>>>;
