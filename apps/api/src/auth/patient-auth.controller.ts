import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { patientLogin } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { AuditService } from "../common/audit.service";
import { hmac } from "../common/crypto";
import { deviceType } from "../common/device";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { NidaClient, type NidaPerson, NidaUnavailable } from "./nida.client";
import { SessionService } from "./session.service";
import { ThrottleService } from "./throttle.service";

@Controller("auth/patient")
export class PatientAuthController {
  constructor(
    private db: DbService,
    private nida: NidaClient,
    private throttle: ThrottleService,
    private sessions: SessionService,
    private audit: AuditService,
  ) {}

  /** FR 1.1 to 1.8: national ID, date of birth and one name, checked against NIDA. */
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parse(patientLogin, body);
    const nidHash = hmac(input.nationalId);
    const key = `nid:${nidHash}`;

    const until = await this.throttle.lockedUntil(key);
    if (until) throw locked(until);

    let result;
    try {
      result = await this.nida.verify(input.nationalId, input.dateOfBirth, input.name);
    } catch (e) {
      if (e instanceof NidaUnavailable) {
        // FR 1.5: the failure is logged.
        await this.audit.record({ type: "system" }, "nida.unavailable", undefined, req.ip);
        throw new ApiException(503, "NIDA_UNAVAILABLE", "Verification is temporarily unavailable.");
      }
      throw e;
    }

    if (!result.match) {
      const f = await this.throttle.fail(key);
      await this.audit.record({ type: "anonymous" }, "patient.login.failed", { locked: f.locked, device: deviceType(req.header("user-agent")) }, req.ip);
      if (f.locked) throw locked(f.until);
      throw new ApiException(
        401,
        "INVALID_CREDENTIALS",
        "Those details don't match the national ID record. Check the ID number, date of birth and name, and try again.",
        { fields: { attemptsLeft: String(f.left) } },
      );
    }

    await this.throttle.clear(key);
    const patient = await this.upsert(nidHash, result.person);
    // NFR 7: the language chosen before logging in becomes this patient's (red flags, notifications).
    const lang = req.cookies?.uc_lang;
    if ((lang === "rw" || lang === "en") && lang !== patient.lang) await this.db.client.patient.update({ where: { id: patient.id }, data: { lang } });
    // FR 1.3: children registered to this parent become reachable through their account.
    for (const child of result.children) {
      const c = await this.upsert(null, child);
      await this.db.client.familyLink.upsert({
        where: { guardianId_dependantId: { guardianId: patient.id, dependantId: c.id } },
        create: { guardianId: patient.id, dependantId: c.id, relation: "CHILD" },
        update: {},
      });
    }
    await this.db.client.patient.update({ where: { id: patient.id }, data: { lastLoginAt: new Date() } });
    await this.sessions.create(res, req, { patientId: patient.id, sharedDevice: input.sharedDevice });
    await this.audit.record(
      { type: "patient", id: patient.id },
      "patient.login",
      { sharedDevice: input.sharedDevice, device: deviceType(req.header("user-agent")) },
      req.ip,
    );
    return { ok: true };
  }

  private async upsert(nidHash: string | null, p: NidaPerson) {
    const data = {
      fullName: p.fullName,
      firstName: p.firstName,
      dateOfBirth: new Date(`${p.dateOfBirth}T00:00:00Z`),
      sex: p.sex,
      district: p.district,
    };
    const existing = await this.db.client.patient.findUnique({ where: { nidaRef: p.ref } });
    const patient = existing
      ? await this.db.client.patient.update({ where: { id: existing.id }, data: { ...data, nidHash: nidHash ?? existing.nidHash } })
      : await this.db.client.patient.create({ data: { ...data, nidHash, nidaRef: p.ref } });
    if (!patient.photoUrl) {
      return this.db.client.patient.update({ where: { id: patient.id }, data: { photoUrl: `/api/patients/${patient.id}/photo` } });
    }
    return patient;
  }
}

function locked(until: Date) {
  return new ApiException(423, "LOCKED", "Too many tries with this ID. You can try again after the time shown.", {
    until: until.toISOString(),
  });
}
