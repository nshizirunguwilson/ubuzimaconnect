import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { nidaPersonInput, photoType } from "@ubuzima/shared";
import type { Request } from "express";
import { Auth, CurrentSession } from "../auth/guard";
import { NidaClient, NidaUnavailable } from "../auth/nida.client";
import type { LiveSession } from "../auth/session.service";
import { ApiException } from "../common/errors";
import { AuditService } from "../common/audit.service";
import { parse } from "../common/zod";

/** Turns "NIDA can't be reached" into a message for the administrator. Any other error passes through. */
function whenNidaIsDown(error: unknown): never {
  if (error instanceof NidaUnavailable) {
    throw new ApiException(503, "NIDA_UNAVAILABLE", "The identity service isn't answering. Try again in a minute.");
  }
  throw error;
}

/**
 * The administrator adds a made-up person to the mock NIDA, so a facilitator can log in as their own patient.
 * The details are checked here with the shared rules (and the photo by its bytes), then again by the mock NIDA,
 * which saves them with parameterised queries only. Every addition is logged.
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
    } catch (error) {
      whenNidaIsDown(error);
    }
  }

  @Post("people")
  async add(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const input = parse(nidaPersonInput, body);

    if (input.photo) {
      const photoBytes = Buffer.from(input.photo.slice(input.photo.indexOf(",") + 1), "base64");
      if (!photoType(photoBytes)) {
        const message = "The photo isn't a real JPG or PNG file";
        throw new ApiException(400, "VALIDATION", message, { fields: { photo: message } });
      }
    }

    let result;
    try {
      result = await this.nida.addPerson({ ...input, names: input.names.join(" ") });
    } catch (error) {
      whenNidaIsDown(error);
    }
    if (!result.ok) throw new ApiException(400, "VALIDATION", result.message);

    await this.audit.record(
      { type: "staff", id: session.staffId },
      "nida.person.added",
      { ref: result.person.ref, withId: Boolean(result.person.nationalId) },
      request.ip,
    );
    return result.person;
  }
}
