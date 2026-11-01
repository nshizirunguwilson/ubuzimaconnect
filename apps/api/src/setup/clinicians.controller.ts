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

/** A facility manager invites, edits and deactivates the clinicians of their own facility only. */
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
  async list(@CurrentSession() session: LiveSession) {
    return this.db.client.staff.findMany({
      where: { role: "CLINICIAN", facilityId: this.facilityId(session) },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        specialty: true,
        licenceNumber: true,
        status: true,
        lastLoginAt: true,
      },
    });
  }

  @Post()
  async create(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const input = parse(clinicianInvite, body);
    const emailTaken = (await this.db.client.staff.findUnique({ where: { email: input.email } })) !== null;
    if (emailTaken) {
      const message = "Someone already has an account with this email";
      throw new ApiException(409, "CONFLICT", message, { fields: { email: message } });
    }

    const clinician = await this.db.client.staff.create({
      data: { ...input, role: "CLINICIAN", facilityId: this.facilityId(session), invitedById: session.staffId },
    });
    await this.codes.sendLink(clinician, "INVITATION", session.staff!.name);
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "clinician.invited",
      { staffId: clinician.id, specialty: clinician.specialty },
      request.ip,
    );
    return { id: clinician.id };
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const clinician = await this.own(id, session);
    const input = parse(clinicianInvite.omit({ email: true }), body);
    await this.db.client.staff.update({ where: { id: clinician.id }, data: input });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "clinician.updated",
      { staffId: clinician.id, specialty: input.specialty },
      request.ip,
    );
    return { ok: true };
  }

  /** Deactivated accounts are kept, never deleted. Their sessions end at once. */
  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const clinician = await this.own(id, session);
    await this.db.client.staff.update({ where: { id: clinician.id }, data: { status: "DEACTIVATED" } });
    await this.db.client.session.updateMany({
      where: { staffId: clinician.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "clinician.deactivated",
      { staffId: clinician.id },
      request.ip,
    );
    // Patients on their way to this clinician go to a colleague.
    await this.routing.reassignFrom(clinician.id, "Account deactivated");
    return { ok: true };
  }

  /** Sends a new invitation when the first one wasn't used. */
  @Post(":id/invitation")
  @HttpCode(200)
  async resend(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const clinician = await this.own(id, session);
    if (clinician.status !== "INVITED")
      throw new ApiException(409, "CONFLICT", "This person has already set a password.");
    await this.codes.sendLink(clinician, "INVITATION", session.staff!.name);
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "staff.invitation.resent",
      { staffId: clinician.id },
      request.ip,
    );
    return { ok: true };
  }

  private facilityId(session: LiveSession) {
    if (!session.staff?.facilityId)
      throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility.");
    return session.staff.facilityId;
  }

  /** A clinician at this manager's facility. */
  private async own(id: string, session: LiveSession) {
    const clinician = await this.db.client.staff.findFirst({
      where: { id, role: "CLINICIAN", facilityId: this.facilityId(session) },
    });
    if (!clinician) throw new ApiException(404, "NOT_FOUND", "This clinician isn't at your facility.");
    return clinician;
  }
}
