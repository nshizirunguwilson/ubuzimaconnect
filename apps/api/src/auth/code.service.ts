import { Injectable } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import type { CodePurpose, Staff, TokenPurpose } from "@ubuzima/db";
import { hmac, newCode, newToken, sameHash, sha256 } from "../common/crypto";
import { DbService } from "../common/db.service";
import { env } from "../common/env";
import { ApiException } from "../common/errors";
import { MailService } from "../common/mail.service";

type Recipient = Pick<Staff, "id" | "email" | "name">;

const CODE_MINUTES: Record<CodePurpose, number> = {
  LOGIN: LIMITS.loginCodeMinutes,
  UNLOCK: LIMITS.unlockCodeMinutes,
};

/** "042913" is shown as "042 913", which is easier to read and type. */
function spaced(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

// The emails. Plain text, so they read the same in every mail app.

function loginCodeEmail(name: string, code: string) {
  return {
    subject: `${spaced(code)} is your UbuzimaConnect login code`,
    text:
      `Hello ${name},\n\n` +
      `Your login code is ${spaced(code)}. It works for ${CODE_MINUTES.LOGIN} minutes.\n\n` +
      `If you didn't try to log in, change your password.\n\n` +
      `UbuzimaConnect`,
  };
}

function unlockCodeEmail(name: string, code: string) {
  return {
    subject: "Your UbuzimaConnect account is locked",
    text:
      `Hello ${name},\n\n` +
      `Your account was locked after too many wrong passwords.\n\n` +
      `Your unlock code is ${spaced(code)}. It works for ${CODE_MINUTES.UNLOCK} minutes. Enter it at ${env.webUrl}/staff/unlock\n\n` +
      `If this wasn't you, reset your password: ${env.webUrl}/staff/reset\n\n` +
      `UbuzimaConnect`,
  };
}

function invitationEmail(name: string, token: string, invitedBy: string) {
  return {
    subject: "You've been invited to UbuzimaConnect",
    text:
      `Hello ${name},\n\n` +
      `${invitedBy} has created a UbuzimaConnect account for you.\n\n` +
      `Set your password here (the link works for ${LIMITS.invitationHours} hours):\n` +
      `${env.webUrl}/staff/invitation/${token}\n\n` +
      `UbuzimaConnect`,
  };
}

function passwordResetEmail(name: string, token: string) {
  return {
    subject: "Reset your UbuzimaConnect password",
    text:
      `Hello ${name},\n\n` +
      `Use this link to choose a new password. It works for ${LIMITS.resetLinkMinutes} minutes and only once:\n` +
      `${env.webUrl}/staff/reset/${token}\n\n` +
      `If you didn't ask for this, you can ignore this email.\n\n` +
      `UbuzimaConnect`,
  };
}

/**
 * Six-digit codes sent by email (to log in, or to unlock an account) and single-use links
 * (to accept an invitation, or to reset a password). Only hashes of the codes and links are stored.
 */
@Injectable()
export class CodeService {
  constructor(
    private db: DbService,
    private mail: MailService,
  ) {}

  /** Emails a new code. It cancels any earlier code for the same purpose. */
  async send(staff: Recipient, purpose: CodePurpose) {
    const code = newCode();

    await this.db.client.emailCode.updateMany({
      where: { staffId: staff.id, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.db.client.emailCode.create({
      data: {
        staffId: staff.id,
        purpose,
        codeHash: hmac(code),
        expiresAt: new Date(Date.now() + CODE_MINUTES[purpose] * 60_000),
      },
    });

    const email = purpose === "LOGIN" ? loginCodeEmail(staff.name, code) : unlockCodeEmail(staff.name, code);
    await this.mail.send(staff.email, email.subject, email.text);
  }

  /**
   * Checks a code typed by the person. Throws when it is wrong or has expired.
   * After too many wrong tries the code is cancelled and a new one must be sent.
   */
  async check(staffId: string, purpose: CodePurpose, code: string) {
    const latest = await this.db.client.emailCode.findFirst({
      where: { staffId, purpose, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!latest || latest.expiresAt.getTime() < Date.now()) {
      throw new ApiException(400, "CODE_EXPIRED", "That code has expired. Send a new one.");
    }

    if (sameHash(latest.codeHash, hmac(code))) {
      await this.db.client.emailCode.update({ where: { id: latest.id }, data: { usedAt: new Date() } });
      return;
    }

    const tries = latest.tries + 1;
    const tooManyTries = tries >= LIMITS.codeMaxTries;
    await this.db.client.emailCode.update({
      where: { id: latest.id },
      data: { tries, usedAt: tooManyTries ? new Date() : null },
    });
    if (tooManyTries) {
      throw new ApiException(400, "CODE_EXPIRED", "Too many wrong codes. Send a new one.");
    }
    throw new ApiException(400, "CODE_INVALID", "That code is wrong. Check the latest email and try again.");
  }

  /** Emails a single-use link. It cancels any earlier link for the same purpose. */
  async sendLink(staff: Recipient, purpose: TokenPurpose, invitedBy?: string) {
    const token = newToken();
    const isInvitation = purpose === "INVITATION";
    const lifetimeMs = isInvitation ? LIMITS.invitationHours * 3_600_000 : LIMITS.resetLinkMinutes * 60_000;

    await this.db.client.staffToken.updateMany({
      where: { staffId: staff.id, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.db.client.staffToken.create({
      data: { staffId: staff.id, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + lifetimeMs) },
    });

    const email = isInvitation
      ? invitationEmail(staff.name, token, invitedBy ?? "An administrator")
      : passwordResetEmail(staff.name, token);
    await this.mail.send(staff.email, email.subject, email.text);
  }
}
