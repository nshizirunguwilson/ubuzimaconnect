import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { nidaPersonInput, photoType } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import { NidaClient, NidaUnavailable } from "../auth/nida.client";
import type { LiveSession } from "../auth/session.service";

/**
 * D73: the administrator adds a made-up person to the mock NIDA, so a facilitator can log in as their own patient.
 * The input is checked here with the shared rules, the photo by its bytes, and again by the mock NIDA; the mock NIDA
 * writes it with parameterised queries only. Every addition is logged.
 */
@Controller("staff/nida")
@Auth({ kind: "staff", roles: ["ADMIN"] })
export class NidaAdminController {
  constructor(
    private nida: NidaClient,
    private audit: AuditService,
  ) {}

  @Get("people")
  async people() {
    try {
      return await this.nida.people();
    } catch (e) {
      if (e instanceof NidaUnavailable) throw new ApiException(503, "NIDA_UNAVAILABLE", "The identity service isn't answering. Try again in a minute.");
      throw e;
    }
  }

  @Post("people")
  async add(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const input = parse(nidaPersonInput, body);
    if (input.photo && !photoType(Buffer.from(input.photo.slice(input.photo.indexOf(",") + 1), "base64"))) {
      throw new ApiException(400, "VALIDATION", "The photo isn't a real JPG or PNG file", { fields: { photo: "The photo isn't a real JPG or PNG file" } });
    }
    let r;
    try {
      r = await this.nida.addPerson({ ...input, names: input.names.join(" ") });
    } catch (e) {
      if (e instanceof NidaUnavailable) throw new ApiException(503, "NIDA_UNAVAILABLE", "The identity service isn't answering. Try again in a minute.");
      throw e;
    }
    if (!r.ok) throw new ApiException(400, "VALIDATION", r.message);
    await this.audit.record({ type: "staff", id: s.staffId }, "nida.person.added", { ref: r.person.ref, withId: !!r.person.nationalId }, req.ip);
    return r.person;
  }
}
