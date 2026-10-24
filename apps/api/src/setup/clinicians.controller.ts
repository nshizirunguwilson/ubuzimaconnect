import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from "@nestjs/common";
import { clinicianInvite } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { CodeService } from "../auth/code.service";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { RoutingService } from "../cases/routing.service";

/** FR 8.2: a facility manager creates, edits and deactivates the clinicians of their own facility only. */
@Controller("clinicians")
@Auth({ kind: "staff", roles: ["FACILITY_MANAGER"] })
export class CliniciansController {
  constructor(
    private db: DbService,
    private codes: CodeService,
    private audit: AuditService,
    private routing: RoutingService,
  ) {}

  @Get()
  async list(@CurrentSession() s: LiveSession) {
    return this.db.client.staff.findMany({
      where: { role: "CLINICIAN", facilityId: this.facilityId(s) },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, specialty: true, licenceNumber: true, status: true, lastLoginAt: true },
    });
  }

  @Post()
  async create(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const input = parse(clinicianInvite, body);
    if (await this.db.client.staff.findUnique({ where: { email: input.email } })) {
      throw new ApiException(409, "CONFLICT", "Someone already has an account with this email", {
        fields: { email: "Someone already has an account with this email" },
      });
    }
    const c = await this.db.client.staff.create({
      data: { ...input, role: "CLINICIAN", facilityId: this.facilityId(s), invitedById: s.staffId },
    });
    await this.codes.sendLink(c, "INVITATION", s.staff!.name);
    await this.audit.record({ type: "staff", id: s.staffId }, "clinician.invited", { staffId: c.id, specialty: c.specialty }, req.ip);
    return { id: c.id };
  }

  @Put(":id")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(id, s);
    const input = parse(clinicianInvite.omit({ email: true }), body);
    await this.db.client.staff.update({ where: { id: c.id }, data: input });
    await this.audit.record({ type: "staff", id: s.staffId }, "clinician.updated", { staffId: c.id, specialty: input.specialty }, req.ip);
    return { ok: true };
  }

  /** Deactivated accounts are kept, never deleted (FR 8.2). Their sessions end at once. */
  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(id, s);
    await this.db.client.staff.update({ where: { id: c.id }, data: { status: "DEACTIVATED" } });
    await this.db.client.session.updateMany({ where: { staffId: c.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.record({ type: "staff", id: s.staffId }, "clinician.deactivated", { staffId: c.id }, req.ip);
    await this.routing.reassignFrom(c.id, "Account deactivated");
    return { ok: true };
  }

  /** FR 2.6: the facility manager can send a new invitation. */
  @Post(":id/invitation")
  @HttpCode(200)
  async resend(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(id, s);
    if (c.status !== "INVITED") throw new ApiException(409, "CONFLICT", "This person has already set a password.");
    await this.codes.sendLink(c, "INVITATION", s.staff!.name);
    await this.audit.record({ type: "staff", id: s.staffId }, "staff.invitation.resent", { staffId: c.id }, req.ip);
    return { ok: true };
  }

  private facilityId(s: LiveSession) {
    if (!s.staff?.facilityId) throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility.");
    return s.staff.facilityId;
  }

  private async own(id: string, s: LiveSession) {
    const c = await this.db.client.staff.findFirst({ where: { id, role: "CLINICIAN", facilityId: this.facilityId(s) } });
    if (!c) throw new ApiException(404, "NOT_FOUND", "This clinician isn't at your facility.");
    return c;
  }
}
