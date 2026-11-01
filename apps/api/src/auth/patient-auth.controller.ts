import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { patientLogin } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { AuditService } from "../common/audit.service";
import { hmac } from "../common/crypto";
import { DbService } from "../common/db.service";
import { deviceType } from "../common/device";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { NidaClient, type NidaPerson, type NidaResult, NidaUnavailable } from "./nida.client";
import { SessionService } from "./session.service";
import { ThrottleService } from "./throttle.service";

/**
 * Patient login: national ID, date of birth and one name, checked against NIDA. There is no password.
 * Children registered to the parent in NIDA become reachable through the parent's account.
 */
@Controller("auth/patient")
export class PatientAuthController {
  constructor(
    private db: DbService,
    private nida: NidaClient,
    private throttle: ThrottleService,
    private sessions: SessionService,
    private audit: AuditService,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const input = parse(patientLogin, body);
    const nationalIdHash = hmac(input.nationalId);
    const key = `nid:${nationalIdHash}`;
    const device = deviceType(request.header("user-agent"));

    const lockedUntil = await this.throttle.lockedUntil(key);
    if (lockedUntil) throw locked(lockedUntil);

    const result = await this.verifyWithNida(input, request.ip);

    if (!result.match) {
      const failure = await this.throttle.fail(key);
      await this.audit.record(
        { type: "anonymous" },
        "patient.login.failed",
        { locked: failure.locked, device },
        request.ip,
      );
      if (failure.locked) throw locked(failure.until);
      throw new ApiException(
        401,
        "INVALID_CREDENTIALS",
        "Those details don't match the national ID record. Check the ID number, date of birth and name, and try again.",
        { fields: { attemptsLeft: String(failure.left) } },
      );
    }

    await this.throttle.clear(key);
    const patient = await this.savePatient(nationalIdHash, result.person);
    await this.keepChosenLanguage(patient, request);
    await this.linkChildren(patient.id, result.children);

    await this.db.client.patient.update({ where: { id: patient.id }, data: { lastLoginAt: new Date() } });
    await this.sessions.create(response, request, { patientId: patient.id, sharedDevice: input.sharedDevice });
    await this.audit.record(
      { type: "patient", id: patient.id },
      "patient.login",
      { sharedDevice: input.sharedDevice, device },
      request.ip,
    );
    return { ok: true };
  }

  /** Asks NIDA. When NIDA can't be reached, the failure is logged and the patient is told to try later. */
  private async verifyWithNida(
    input: { nationalId: string; dateOfBirth: string; name: string },
    ip?: string,
  ): Promise<NidaResult> {
    try {
      return await this.nida.verify(input.nationalId, input.dateOfBirth, input.name);
    } catch (error) {
      if (!(error instanceof NidaUnavailable)) throw error;
      await this.audit.record({ type: "system" }, "nida.unavailable", undefined, ip);
      throw new ApiException(503, "NIDA_UNAVAILABLE", "Verification is temporarily unavailable.");
    }
  }

  /** The language chosen on the login screen becomes the patient's, for questions and notifications. */
  private async keepChosenLanguage(patient: { id: string; lang: string }, request: Request) {
    const chosen = request.cookies?.uc_lang;
    const isKnownLanguage = chosen === "rw" || chosen === "en";
    if (isKnownLanguage && chosen !== patient.lang) {
      await this.db.client.patient.update({ where: { id: patient.id }, data: { lang: chosen } });
    }
  }

  /** Children registered to this parent in NIDA, linked to the parent's account. */
  private async linkChildren(parentId: string, children: NidaPerson[]) {
    for (const child of children) {
      const childPatient = await this.savePatient(null, child);
      await this.db.client.familyLink.upsert({
        where: { guardianId_dependantId: { guardianId: parentId, dependantId: childPatient.id } },
        create: { guardianId: parentId, dependantId: childPatient.id, relation: "CHILD" },
        update: {},
      });
    }
  }

  /**
   * Creates or updates the patient from NIDA's details. The national ID itself is never stored, only its hash
   * (null for a child, who has no ID card of their own).
   */
  private async savePatient(nationalIdHash: string | null, person: NidaPerson) {
    const details = {
      fullName: person.fullName,
      firstName: person.firstName,
      dateOfBirth: new Date(`${person.dateOfBirth}T00:00:00Z`),
      sex: person.sex,
      district: person.district,
    };

    const existing = await this.db.client.patient.findUnique({ where: { nidaRef: person.ref } });
    const patient = existing
      ? await this.db.client.patient.update({
          where: { id: existing.id },
          data: { ...details, nidHash: nationalIdHash ?? existing.nidHash },
        })
      : await this.db.client.patient.create({
          data: { ...details, nidHash: nationalIdHash, nidaRef: person.ref },
        });

    // The photo is served through the API, which fetches it from NIDA when asked.
    if (!patient.photoUrl) {
      return this.db.client.patient.update({
        where: { id: patient.id },
        data: { photoUrl: `/api/patients/${patient.id}/photo` },
      });
    }
    return patient;
  }
}

function locked(until: Date) {
  return new ApiException(423, "LOCKED", "Too many tries with this ID. You can try again after the time shown.", {
    until: until.toISOString(),
  });
}
