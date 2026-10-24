import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { emailCode, LIMITS, resetRequest, setPassword, staffLogin, unlockRequest } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuditService } from "../common/audit.service";
import { checkPassword, dummyHash, hashPassword, hmac, sameHash, sha256 } from "../common/crypto";
import { DbService } from "../common/db.service";
import { deviceType } from "../common/device";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { CodeService } from "./code.service";
import { SessionService } from "./session.service";
import { ThrottleService } from "./throttle.service";

const GENERIC = "That email and password don't match. Check them and try again.";

@Controller("auth/staff")
export class StaffAuthController {
  constructor(
    private db: DbService,
    private throttle: ThrottleService,
    private sessions: SessionService,
    private codes: CodeService,
    private audit: AuditService,
  ) {}

  /** FR 2.1, 2.3, 2.4: password first; on success an email code is sent (FR 2.2). */
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, password } = parse(staffLogin, body);
    const key = `staff:${hmac(email)}`;
    const staff = await this.db.client.staff.findUnique({ where: { email } });

    if (staff?.status === "LOCKED_EMAIL") throw emailLocked();
    const until = await this.throttle.lockedUntil(key);
    if (until) throw tempLocked(until);

    const ok = staff?.passwordHash ? await checkPassword(staff.passwordHash, password) : await checkPassword(await dummyHash(), password);
    if (!staff || !ok || staff.status === "INVITED") {
      const f = await this.throttle.fail(key);
      await this.audit.record({ type: staff ? "staff" : "anonymous", id: staff?.id }, "staff.login.failed", { locked: f.locked, device: deviceType(req.header("user-agent")) }, req.ip);
      if (!f.locked) throw new ApiException(401, "INVALID_CREDENTIALS", GENERIC, { fields: { attemptsLeft: String(f.left) } });
      // FR 2.4: the second lock in a row needs an emailed unlock code.
      if (staff && f.locksInARow >= 2) {
        await this.db.client.staff.update({ where: { id: staff.id }, data: { status: "LOCKED_EMAIL" } });
        await this.throttle.clear(key);
        await this.codes.send(staff, "UNLOCK");
        await this.audit.record({ type: "staff", id: staff.id }, "staff.locked.email", undefined, req.ip);
        throw emailLocked();
      }
      throw tempLocked(f.until);
    }
    if (staff.status === "DEACTIVATED") {
      throw new ApiException(403, "DEACTIVATED", "This account has been turned off. Ask your administrator.");
    }

    // A pending session that only lets the person enter the code, for 5 minutes.
    await this.sessions.create(res, req, { staffId: staff.id, verified: false, ttlMs: LIMITS.loginCodeMinutes * 60_000 });
    await this.codes.send(staff, "LOGIN");
    return { next: "code", email: maskEmail(staff.email) };
  }

  /** FR 2.2: the 6-digit code completes the login. */
  @Post("code")
  @HttpCode(200)
  async code(@Body() body: unknown, @Req() req: Request) {
    const { code } = parse(emailCode, body);
    const s = await this.sessions.current(req);
    if (!s?.staff || s.verified) {
      throw new ApiException(401, "UNAUTHENTICATED", "This login has timed out. Enter your email and password again.");
    }
    await this.codes.check(s.staff.id, "LOGIN", code);
    await this.sessions.verify(s.id);
    await this.throttle.clear(`staff:${hmac(s.staff.email)}`);
    await this.db.client.staff.update({ where: { id: s.staff.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ type: "staff", id: s.staff.id }, "staff.login", { device: deviceType(req.header("user-agent")) }, req.ip);
    return { ok: true, role: s.staff.role };
  }

  @Post("code/resend")
  @HttpCode(200)
  async resend(@Req() req: Request) {
    const s = await this.sessions.current(req);
    if (!s?.staff || s.verified) {
      throw new ApiException(401, "UNAUTHENTICATED", "This login has timed out. Enter your email and password again.");
    }
    await this.codes.send(s.staff, "LOGIN");
    return { ok: true };
  }

  /** FR 2.4: the emailed unlock code reopens an account locked a second time. */
  @Post("unlock")
  @HttpCode(200)
  async unlock(@Body() body: unknown, @Req() req: Request) {
    const { email, code } = parse(unlockRequest, body);
    const staff = await this.db.client.staff.findUnique({ where: { email } });
    if (!staff || staff.status !== "LOCKED_EMAIL") {
      throw new ApiException(400, "CODE_INVALID", "That code is wrong or has expired. Send a new one.");
    }
    await this.codes.check(staff.id, "UNLOCK", code);
    await this.db.client.staff.update({ where: { id: staff.id }, data: { status: "ACTIVE" } });
    await this.throttle.clear(`staff:${hmac(email)}`);
    await this.audit.record({ type: "staff", id: staff.id }, "staff.unlocked", undefined, req.ip);
    return { ok: true };
  }

  /** Always answers the same way, so it can't be used to find out which emails have accounts. */
  @Post("unlock/resend")
  @HttpCode(200)
  async unlockResend(@Body() body: unknown) {
    const { email } = parse(resetRequest, body);
    const staff = await this.db.client.staff.findUnique({ where: { email } });
    if (staff?.status === "LOCKED_EMAIL") await this.codes.send(staff, "UNLOCK");
    return { ok: true };
  }

  /** FR 2.7: a reset link by email. Same answer whether or not the account exists. */
  @Post("reset")
  @HttpCode(200)
  async reset(@Body() body: unknown, @Req() req: Request) {
    const { email } = parse(resetRequest, body);
    const staff = await this.db.client.staff.findUnique({ where: { email } });
    if (staff && (staff.status === "ACTIVE" || staff.status === "LOCKED_EMAIL")) {
      await this.codes.sendLink(staff, "PASSWORD_RESET");
      await this.audit.record({ type: "staff", id: staff.id }, "staff.reset.requested", undefined, req.ip);
    }
    return { ok: true };
  }

  /** Who a link belongs to, so the page can greet them, or why it no longer works. */
  @Get("links/:token")
  async link(@Param("token") token: string) {
    const t = await this.findLink(token);
    return { purpose: t.purpose, name: t.staff.name, email: t.staff.email };
  }

  /** FR 2.6 and 2.7: set the first password from an invitation, or a new one from a reset link. */
  @Post("password")
  @HttpCode(200)
  async password(@Body() body: unknown, @Req() req: Request) {
    const { token, password } = parse(setPassword, body);
    const t = await this.findLink(token);
    if (t.staff.status === "DEACTIVATED") throw badLink();
    await this.db.client.$transaction([
      this.db.client.staffToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
      this.db.client.staff.update({
        where: { id: t.staff.id },
        // FR 2.4: a reset changes the password but doesn't unlock; only the emailed unlock code does.
        data: { passwordHash: await hashPassword(password), status: t.staff.status === "LOCKED_EMAIL" ? "LOCKED_EMAIL" : "ACTIVE" },
      }),
    ]);
    if (t.staff.status !== "LOCKED_EMAIL") await this.throttle.clear(`staff:${hmac(t.staff.email)}`);
    await this.sessions.revokeAllForStaff(t.staff.id);
    await this.audit.record(
      { type: "staff", id: t.staff.id },
      t.purpose === "INVITATION" ? "staff.invitation.accepted" : "staff.password.reset",
      undefined,
      req.ip,
    );
    return { ok: true };
  }

  private async findLink(token: string) {
    if (!z.string().min(20).max(100).safeParse(token).success) throw badLink();
    const t = await this.db.client.staffToken.findUnique({ where: { tokenHash: sha256(token) }, include: { staff: true } });
    if (!t || t.usedAt || t.expiresAt.getTime() < Date.now() || !sameHash(t.tokenHash, sha256(token))) throw badLink();
    return t;
  }
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

const tempLocked = (until: Date) =>
  new ApiException(423, "LOCKED", `Too many wrong passwords. Try again in ${LIMITS.lockMinutes} minutes.`, {
    until: until.toISOString(),
  });

const emailLocked = () =>
  new ApiException(423, "LOCKED_EMAIL_UNLOCK", "This account is locked. We've emailed you a code to unlock it.");

const badLink = () =>
  new ApiException(400, "TOKEN_INVALID", "This link has expired or has already been used. Ask for a new one.");
