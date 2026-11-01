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

/** The same message for a wrong email and a wrong password, so nobody can find out which emails have accounts. */
const WRONG_EMAIL_OR_PASSWORD = "That email and password don't match. Check them and try again.";
/** After this many locks in a row, the account needs an emailed unlock code rather than waiting. */
const LOCKS_BEFORE_EMAIL_UNLOCK = 2;

/** The key failed logins are counted under. */
const throttleKey = (email: string) => `staff:${hmac(email)}`;

/**
 * Staff login: email and password first, then a 6-digit code sent by email.
 * Also unlocking an account, resetting a password and accepting an invitation.
 */
@Controller("auth/staff")
export class StaffAuthController {
  constructor(
    private db: DbService,
    private throttle: ThrottleService,
    private sessions: SessionService,
    private codes: CodeService,
    private audit: AuditService,
  ) {}

  /** Step 1: the password. When it is right, a login code is emailed and a pending session starts. */
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const { email, password } = parse(staffLogin, body);
    const key = throttleKey(email);
    const staff = await this.db.client.staff.findUnique({ where: { email } });

    if (staff?.status === "LOCKED_EMAIL") throw emailLocked();
    const lockedUntil = await this.throttle.lockedUntil(key);
    if (lockedUntil) throw temporarilyLocked(lockedUntil);

    // With no account, a dummy hash is still checked, so a wrong email takes as long as a wrong password.
    const hashToCheck = staff?.passwordHash || (await dummyHash());
    const passwordIsRight = await checkPassword(hashToCheck, password);
    const canLogIn = staff && staff.passwordHash && passwordIsRight && staff.status !== "INVITED";

    if (!canLogIn) {
      const failure = await this.throttle.fail(key);
      await this.audit.record(
        { type: staff ? "staff" : "anonymous", id: staff?.id },
        "staff.login.failed",
        { locked: failure.locked, device: deviceType(request.header("user-agent")) },
        request.ip,
      );

      if (!failure.locked) {
        throw new ApiException(401, "INVALID_CREDENTIALS", WRONG_EMAIL_OR_PASSWORD, {
          fields: { attemptsLeft: String(failure.left) },
        });
      }

      if (staff && failure.locksInARow >= LOCKS_BEFORE_EMAIL_UNLOCK) {
        await this.lockUntilEmailUnlock(staff, key, request.ip);
        throw emailLocked();
      }
      throw temporarilyLocked(failure.until);
    }

    if (staff.status === "DEACTIVATED") {
      throw new ApiException(403, "DEACTIVATED", "This account has been turned off. Ask your administrator.");
    }

    // A pending session that only lets the person enter the code, for as long as the code works.
    await this.sessions.create(response, request, {
      staffId: staff.id,
      verified: false,
      ttlMs: LIMITS.loginCodeMinutes * 60_000,
    });
    await this.codes.send(staff, "LOGIN");
    return { next: "code", email: maskEmail(staff.email) };
  }

  /** Step 2: the emailed code completes the login. */
  @Post("code")
  @HttpCode(200)
  async code(@Body() body: unknown, @Req() request: Request) {
    const { code } = parse(emailCode, body);
    const { session, staff } = await this.pendingLogin(request);

    await this.codes.check(staff.id, "LOGIN", code);
    await this.sessions.verify(session.id);
    await this.throttle.clear(throttleKey(staff.email));
    await this.db.client.staff.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
    await this.audit.record(
      { type: "staff", id: staff.id },
      "staff.login",
      { device: deviceType(request.header("user-agent")) },
      request.ip,
    );
    return { ok: true, role: staff.role };
  }

  @Post("code/resend")
  @HttpCode(200)
  async resend(@Req() request: Request) {
    const { staff } = await this.pendingLogin(request);
    await this.codes.send(staff, "LOGIN");
    return { ok: true };
  }

  /** The emailed unlock code reopens an account that was locked twice in a row. */
  @Post("unlock")
  @HttpCode(200)
  async unlock(@Body() body: unknown, @Req() request: Request) {
    const { email, code } = parse(unlockRequest, body);
    const staff = await this.db.client.staff.findUnique({ where: { email } });
    if (!staff || staff.status !== "LOCKED_EMAIL") {
      throw new ApiException(400, "CODE_INVALID", "That code is wrong or has expired. Send a new one.");
    }

    await this.codes.check(staff.id, "UNLOCK", code);
    await this.db.client.staff.update({ where: { id: staff.id }, data: { status: "ACTIVE" } });
    await this.throttle.clear(throttleKey(email));
    await this.audit.record({ type: "staff", id: staff.id }, "staff.unlocked", undefined, request.ip);
    return { ok: true };
  }

  /** Always answers the same way, so it can't be used to find out which emails have accounts. */
  @Post("unlock/resend")
  @HttpCode(200)
  async unlockResend(@Body() body: unknown) {
    const { email } = parse(resetRequest, body);
    const staff = await this.db.client.staff.findUnique({ where: { email } });
    if (staff?.status === "LOCKED_EMAIL") {
      await this.codes.send(staff, "UNLOCK");
    }
    return { ok: true };
  }

  /** Emails a password reset link. The same answer whether or not the account exists. */
  @Post("reset")
  @HttpCode(200)
  async reset(@Body() body: unknown, @Req() request: Request) {
    const { email } = parse(resetRequest, body);
    const staff = await this.db.client.staff.findUnique({ where: { email } });
    const mayReset = staff && (staff.status === "ACTIVE" || staff.status === "LOCKED_EMAIL");
    if (mayReset) {
      await this.codes.sendLink(staff, "PASSWORD_RESET");
      await this.audit.record({ type: "staff", id: staff.id }, "staff.reset.requested", undefined, request.ip);
    }
    return { ok: true };
  }

  /** Who a link belongs to, so the page can greet them, or an error saying why it no longer works. */
  @Get("links/:token")
  async link(@Param("token") token: string) {
    const link = await this.findLink(token);
    return { purpose: link.purpose, name: link.staff.name, email: link.staff.email };
  }

  /** Sets the first password from an invitation link, or a new one from a reset link. */
  @Post("password")
  @HttpCode(200)
  async password(@Body() body: unknown, @Req() request: Request) {
    const { token, password } = parse(setPassword, body);
    const link = await this.findLink(token);
    const staff = link.staff;
    if (staff.status === "DEACTIVATED") throw badLink();

    // A reset changes the password but doesn't unlock the account: only the emailed unlock code does that.
    const stillLocked = staff.status === "LOCKED_EMAIL";
    await this.db.client.$transaction([
      this.db.client.staffToken.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
      this.db.client.staff.update({
        where: { id: staff.id },
        data: { passwordHash: await hashPassword(password), status: stillLocked ? "LOCKED_EMAIL" : "ACTIVE" },
      }),
    ]);

    if (!stillLocked) await this.throttle.clear(throttleKey(staff.email));
    await this.sessions.revokeAllForStaff(staff.id);

    const action = link.purpose === "INVITATION" ? "staff.invitation.accepted" : "staff.password.reset";
    await this.audit.record({ type: "staff", id: staff.id }, action, undefined, request.ip);
    return { ok: true };
  }

  /** The login waiting for its code, or an error when that login has timed out. */
  private async pendingLogin(request: Request) {
    const session = await this.sessions.current(request, "staff");
    if (!session?.staff || session.verified) {
      throw new ApiException(401, "UNAUTHENTICATED", "This login has timed out. Enter your email and password again.");
    }
    return { session, staff: session.staff };
  }

  /** Locks the account until the person enters a code we email them. */
  private async lockUntilEmailUnlock(staff: { id: string; email: string; name: string }, key: string, ip?: string) {
    await this.db.client.staff.update({ where: { id: staff.id }, data: { status: "LOCKED_EMAIL" } });
    await this.throttle.clear(key);
    await this.codes.send(staff, "UNLOCK");
    await this.audit.record({ type: "staff", id: staff.id }, "staff.locked.email", undefined, ip);
  }

  /** An invitation or reset link that is still valid, or an error. */
  private async findLink(token: string) {
    const looksLikeToken = z.string().min(20).max(100).safeParse(token).success;
    if (!looksLikeToken) throw badLink();

    const link = await this.db.client.staffToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { staff: true },
    });
    if (!link || link.usedAt) throw badLink();
    if (link.expiresAt.getTime() < Date.now()) throw badLink();
    if (!sameHash(link.tokenHash, sha256(token))) throw badLink();
    return link;
  }
}

/** "manager@ubuzima.test" becomes "ma•••••@ubuzima.test", to show where the code was sent. */
function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  const hidden = "•".repeat(Math.max(1, user.length - 2));
  return `${user.slice(0, 2)}${hidden}@${domain}`;
}

function temporarilyLocked(until: Date) {
  return new ApiException(423, "LOCKED", `Too many wrong passwords. Try again in ${LIMITS.lockMinutes} minutes.`, {
    until: until.toISOString(),
  });
}

function emailLocked() {
  return new ApiException(423, "LOCKED_EMAIL_UNLOCK", "This account is locked. We've emailed you a code to unlock it.");
}

function badLink() {
  return new ApiException(400, "TOKEN_INVALID", "This link has expired or has already been used. Ask for a new one.");
}
