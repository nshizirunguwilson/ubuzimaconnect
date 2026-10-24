import { Injectable } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import type { CodePurpose, Staff, TokenPurpose } from "@ubuzima/db";
import { hmac, newCode, newToken, sameHash, sha256 } from "../common/crypto";
import { DbService } from "../common/db.service";
import { env } from "../common/env";
import { ApiException } from "../common/errors";
import { MailService } from "../common/mail.service";

const minutes = { LOGIN: LIMITS.loginCodeMinutes, UNLOCK: LIMITS.unlockCodeMinutes } as const;

/** Six-digit email codes (FR 2.2, 2.4) and single-use links (FR 2.6, 2.7). */
@Injectable()
export class CodeService {
  constructor(
    private db: DbService,
    private mail: MailService,
  ) {}

  async send(staff: Pick<Staff, "id" | "email" | "name">, purpose: CodePurpose) {
    const code = newCode();
    // A new code cancels the earlier ones.
    await this.db.client.emailCode.updateMany({ where: { staffId: staff.id, purpose, usedAt: null }, data: { usedAt: new Date() } });
    await this.db.client.emailCode.create({
      data: { staffId: staff.id, purpose, codeHash: hmac(code), expiresAt: new Date(Date.now() + minutes[purpose] * 60_000) },
    });
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    if (purpose === "LOGIN") {
      await this.mail.send(
        staff.email,
        `${spaced} is your UbuzimaConnect login code`,
        `Hello ${staff.name},\n\nYour login code is ${spaced}. It works for ${minutes.LOGIN} minutes.\n\nIf you didn't try to log in, change your password.\n\nUbuzimaConnect`,
      );
    } else {
      await this.mail.send(
        staff.email,
        "Your UbuzimaConnect account is locked",
        `Hello ${staff.name},\n\nYour account was locked after too many wrong passwords.\n\nYour unlock code is ${spaced}. It works for ${minutes.UNLOCK} minutes. Enter it at ${env.webUrl}/staff/unlock\n\nIf this wasn't you, reset your password: ${env.webUrl}/staff/reset\n\nUbuzimaConnect`,
      );
    }
  }

  async check(staffId: string, purpose: CodePurpose, code: string) {
    const c = await this.db.client.emailCode.findFirst({
      where: { staffId, purpose, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!c || c.expiresAt.getTime() < Date.now()) {
      throw new ApiException(400, "CODE_EXPIRED", "That code has expired. Send a new one.");
    }
    if (!sameHash(c.codeHash, hmac(code))) {
      const tries = c.tries + 1;
      await this.db.client.emailCode.update({
        where: { id: c.id },
        data: { tries, usedAt: tries >= LIMITS.codeMaxTries ? new Date() : null },
      });
      if (tries >= LIMITS.codeMaxTries) throw new ApiException(400, "CODE_EXPIRED", "Too many wrong codes. Send a new one.");
      throw new ApiException(400, "CODE_INVALID", "That code is wrong. Check the latest email and try again.");
    }
    await this.db.client.emailCode.update({ where: { id: c.id }, data: { usedAt: new Date() } });
  }

  async sendLink(staff: Pick<Staff, "id" | "email" | "name">, purpose: TokenPurpose, invitedBy?: string) {
    const token = newToken();
    const ttl = purpose === "INVITATION" ? LIMITS.invitationHours * 3_600_000 : LIMITS.resetLinkMinutes * 60_000;
    await this.db.client.staffToken.updateMany({ where: { staffId: staff.id, purpose, usedAt: null }, data: { usedAt: new Date() } });
    await this.db.client.staffToken.create({
      data: { staffId: staff.id, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl) },
    });
    if (purpose === "INVITATION") {
      await this.mail.send(
        staff.email,
        "You've been invited to UbuzimaConnect",
        `Hello ${staff.name},\n\n${invitedBy ?? "An administrator"} has created a UbuzimaConnect account for you.\n\nSet your password here (the link works for ${LIMITS.invitationHours} hours):\n${env.webUrl}/staff/invitation/${token}\n\nUbuzimaConnect`,
      );
    } else {
      await this.mail.send(
        staff.email,
        "Reset your UbuzimaConnect password",
        `Hello ${staff.name},\n\nUse this link to choose a new password. It works for ${LIMITS.resetLinkMinutes} minutes and only once:\n${env.webUrl}/staff/reset/${token}\n\nIf you didn't ask for this, you can ignore this email.\n\nUbuzimaConnect`,
      );
    }
  }
}
