import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from "@nestjs/common";
import { email, invitation, ROLE_LABEL } from "@ubuzima/shared";
import { z } from "zod";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { CodeService } from "../auth/code.service";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { DispatcherService } from "../agent/dispatcher.service";
import { RoutingService } from "../cases/routing.service";

/** FR 12.1 and 2.6: the administrator creates agent and facility manager accounts; each gets an invitation email. */
@Controller("staff")
@Auth({ kind: "staff", roles: ["ADMIN"] })
export class StaffController {
  constructor(
    private db: DbService,
    private codes: CodeService,
    private audit: AuditService,
    private dispatcher: DispatcherService,
    private routing: RoutingService,
  ) {}

  @Get()
  async list() {
    const staff = await this.db.client.staff.findMany({
      orderBy: { createdAt: "desc" },
      include: { facility: { select: { id: true, name: true } } },
    });
    return staff.map(({ id, name, email, role, status, facility, lastLoginAt }) => ({
      id,
      name,
      email,
      role,
      status,
      facility,
      lastLoginAt,
    }));
  }

  @Get("facilities")
  facilities() {
    return this.db.client.facility.findMany({ where: { active: true }, select: { id: true, name: true, district: true }, orderBy: { name: "asc" } });
  }

  @Post("invitations")
  async invite(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const input = parse(invitation, body);
    const needsFacility = input.role === "FACILITY_MANAGER";
    if (needsFacility && !(await this.db.client.facility.findUnique({ where: { id: input.facilityId! } }))) {
      throw new ApiException(400, "VALIDATION", "Choose the facility this person manages", {
        fields: { facilityId: "Choose the facility this person manages" },
      });
    }
    if (await this.db.client.staff.findUnique({ where: { email: input.email } })) {
      throw new ApiException(409, "CONFLICT", "Someone already has an account with this email", {
        fields: { email: "Someone already has an account with this email" },
      });
    }
    const staff = await this.db.client.staff.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        facilityId: needsFacility ? input.facilityId : null,
        licenceNumber: input.licenceNumber || null,
        invitedById: s.staff!.id,
      },
    });
    await this.codes.sendLink(staff, "INVITATION", s.staff!.name);
    await this.audit.record({ type: "staff", id: s.staff!.id }, "staff.invited", { staffId: staff.id, role: ROLE_LABEL[staff.role] }, req.ip);
    return { id: staff.id };
  }

  /** FR 12.2: accounts are deactivated, never deleted. Their sessions end at once. */
  @Post(":id/deactivate")
  @HttpCode(200)
  async deactivate(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    if (id === s.staffId) throw new ApiException(400, "VALIDATION", "You can't turn off your own account.");
    const staff = await this.db.client.staff.findUnique({ where: { id } });
    if (!staff) throw new ApiException(404, "NOT_FOUND", "This account doesn't exist.");
    await this.db.client.staff.update({ where: { id }, data: { status: "DEACTIVATED" } });
    await this.db.client.session.updateMany({ where: { staffId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    // FR 12.2: a deactivated agent's active case returns to the front of its queue level.
    const active = await this.db.client.case.findMany({ where: { agentId: id, status: "ASSIGNED" }, select: { id: true } });
    for (const c of active) await this.dispatcher.requeue(c.id, "Another agent will continue with you.");
    await this.db.client.staff.update({ where: { id }, data: { agentStatus: "OFFLINE", agentStatusSince: new Date() } });
    await this.audit.record({ type: "staff", id: s.staffId }, "staff.deactivated", { staffId: id }, req.ip);
    // FR 5.13: a deactivated clinician's patients on the way go to a colleague.
    if (staff.role === "CLINICIAN") await this.routing.reassignFrom(id, "Account deactivated");
    return { ok: true };
  }

  /** FR 12.3: unlock codes and reset links then go to the new address. */
  @Put(":id/email")
  async changeEmail(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const { email: next } = parse(z.object({ email }), body);
    const staff = await this.db.client.staff.findUnique({ where: { id } });
    if (!staff) throw new ApiException(404, "NOT_FOUND", "This account doesn't exist.");
    if (next !== staff.email && (await this.db.client.staff.findUnique({ where: { email: next } }))) {
      throw new ApiException(409, "CONFLICT", "Someone already has an account with this email", { fields: { email: "Someone already has an account with this email" } });
    }
    await this.db.client.staff.update({ where: { id }, data: { email: next } });
    // Old links and codes were sent to the old address: cancel them.
    await this.db.client.staffToken.updateMany({ where: { staffId: id, usedAt: null }, data: { usedAt: new Date() } });
    await this.db.client.emailCode.updateMany({ where: { staffId: id, usedAt: null }, data: { usedAt: new Date() } });
    await this.audit.record({ type: "staff", id: s.staffId }, "staff.email.changed", { staffId: id }, req.ip);
    return { ok: true };
  }

  /** FR 2.6: send a new invitation when the first one was not used. The old link stops working. */
  @Post(":id/invitation")
  @HttpCode(200)
  async resend(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const staff = await this.db.client.staff.findUnique({ where: { id } });
    if (!staff) throw new ApiException(404, "NOT_FOUND", "This account doesn't exist.");
    if (staff.status !== "INVITED") {
      throw new ApiException(409, "CONFLICT", "This person has already set a password.");
    }
    await this.codes.sendLink(staff, "INVITATION", s.staff!.name);
    await this.audit.record({ type: "staff", id: s.staff!.id }, "staff.invitation.resent", { staffId: staff.id }, req.ip);
    return { ok: true };
  }
}
