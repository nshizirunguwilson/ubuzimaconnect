import { Controller, Get, Header, Param, ParseUUIDPipe } from "@nestjs/common";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { Auth, CurrentSession } from "../auth/guard";
import { NidaClient } from "../auth/nida.client";
import type { LiveSession } from "../auth/session.service";

/** FR 1.10: the identity photo, for the person, their parent, or staff. Fetched from NIDA, never stored. */
@Controller("patients")
@Auth({ kind: "any" })
export class PhotoController {
  constructor(
    private db: DbService,
    private nida: NidaClient,
  ) {}

  @Get(":id/photo")
  @Header("Content-Type", "image/svg+xml")
  @Header("Cache-Control", "private, max-age=3600")
  async photo(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession) {
    const allowed =
      !!s.staff ||
      s.patientId === id ||
      !!(s.patientId && (await this.db.client.familyLink.findUnique({ where: { guardianId_dependantId: { guardianId: s.patientId, dependantId: id } } })));
    if (!allowed) throw new ApiException(403, "FORBIDDEN", "You don't have access to this.");
    const p = await this.db.client.patient.findUnique({ where: { id }, select: { nidaRef: true } });
    if (!p) throw new ApiException(404, "NOT_FOUND", "Not found");
    return this.nida.photo(p.nidaRef);
  }
}
