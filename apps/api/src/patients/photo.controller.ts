import { Controller, Get, Header, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { Response } from "express";
import { Auth, CurrentSession } from "../auth/guard";
import { NidaClient } from "../auth/nida.client";
import type { LiveSession } from "../auth/session.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";

/** The only image types the mock NIDA returns. Anything else is never passed on. */
const PHOTO_TYPES = ["image/svg+xml", "image/jpeg", "image/png"];

/** A patient's identity photo, for the patient, their parent, or staff. Fetched from NIDA each time, never stored. */
@Controller("patients")
@Auth({ kind: "any" })
export class PhotoController {
  constructor(
    private db: DbService,
    private nida: NidaClient,
  ) {}

  @Get(":id/photo")
  @Header("Cache-Control", "private, max-age=3600")
  async photo(@Param("id", ParseUUIDPipe) patientId: string, @CurrentSession() session: LiveSession, @Res() response: Response) {
    if (!(await this.maySee(session, patientId))) {
      throw new ApiException(403, "FORBIDDEN", "You don't have access to this.");
    }

    const patient = await this.db.client.patient.findUnique({ where: { id: patientId }, select: { nidaRef: true } });
    if (!patient) throw new ApiException(404, "NOT_FOUND", "Not found");

    const photo = await this.nida.photo(patient.nidaRef);
    if (!PHOTO_TYPES.includes(photo.type)) throw new ApiException(404, "NOT_FOUND", "Not found");

    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return response.type(photo.type).send(photo.body);
  }

  /** Staff, the patient themself, or their parent. */
  private async maySee(session: LiveSession, patientId: string) {
    if (session.staff) return true;
    if (session.patientId === patientId) return true;
    if (!session.patientId) return false;

    const parentLink = await this.db.client.familyLink.findUnique({
      where: { guardianId_dependantId: { guardianId: session.patientId, dependantId: patientId } },
    });
    return parentLink !== null;
  }
}
