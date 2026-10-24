import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import { bedCapacity, facilityProfile, provinceOf } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { bedUsage } from "./beds";

const profileData = (p: ReturnType<typeof facilityProfile.parse>) => ({
  name: p.name,
  level: p.level,
  services: p.services,
  province: provinceOf(p.district)!,
  district: p.district,
  sector: p.sector || null,
  latitude: p.latitude,
  longitude: p.longitude,
  phone: p.phone || null,
  active: p.active,
});

@Controller("facilities")
export class FacilitiesController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  /** FR 12.1: the administrator sees and creates facilities. */
  @Get()
  @Auth({ kind: "staff", roles: ["ADMIN"] })
  async list() {
    const rows = await this.db.client.facility.findMany({
      orderBy: { name: "asc" },
      include: { staff: { where: { role: "FACILITY_MANAGER", status: { not: "DEACTIVATED" } }, select: { name: true } } },
    });
    return Promise.all(
      rows.map(async ({ staff, ...f }) => {
        const u = await bedUsage(this.db.client, f.id);
        return { ...f, managers: staff.map((s) => s.name), availableBeds: f.totalBeds - u.occupied - u.reserved };
      }),
    );
  }

  @Post()
  @Auth({ kind: "staff", roles: ["ADMIN"] })
  async create(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const p = parse(facilityProfile, body);
    const f = await this.db.client.facility.create({ data: profileData(p) });
    await this.audit.record({ type: "staff", id: s.staffId }, "facility.created", { facilityId: f.id, name: f.name }, req.ip);
    return { id: f.id };
  }

  /** FR 8.1, 8.3, 9.4: the facility manager's own facility only. */
  @Get("mine")
  @Auth({ kind: "staff", roles: ["FACILITY_MANAGER"] })
  async mine(@CurrentSession() s: LiveSession) {
    const f = await this.own(s);
    const u = await bedUsage(this.db.client, f.id);
    return { ...f, occupiedBeds: u.occupied, reservedBeds: u.reserved, availableBeds: f.totalBeds - u.occupied - u.reserved };
  }

  @Put("mine")
  @Auth({ kind: "staff", roles: ["FACILITY_MANAGER"] })
  async update(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const f = await this.own(s);
    const p = parse(facilityProfile, body);
    await this.db.client.facility.update({ where: { id: f.id }, data: profileData(p) });
    await this.audit.record({ type: "staff", id: s.staffId }, "facility.profile.updated", { facilityId: f.id, active: p.active, services: p.services }, req.ip);
    return { ok: true };
  }

  /** FR 8.3: total beds can't go below what is occupied or reserved. */
  @Put("mine/beds")
  @Auth({ kind: "staff", roles: ["FACILITY_MANAGER"] })
  async beds(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const f = await this.own(s);
    const { totalBeds } = parse(bedCapacity, body);
    const u = await bedUsage(this.db.client, f.id);
    const inUse = u.occupied + u.reserved;
    if (totalBeds < inUse) {
      const message = `${inUse} beds are occupied or reserved, so the total can't be lower than ${inUse}.`;
      throw new ApiException(400, "VALIDATION", message, { fields: { totalBeds: message } });
    }
    await this.db.client.facility.update({ where: { id: f.id }, data: { totalBeds } });
    await this.audit.record({ type: "staff", id: s.staffId }, "facility.beds.updated", { facilityId: f.id, from: f.totalBeds, to: totalBeds }, req.ip);
    return { ok: true };
  }

  private async own(s: LiveSession) {
    const f = s.staff?.facilityId ? await this.db.client.facility.findUnique({ where: { id: s.staff.facilityId } }) : null;
    if (!f) throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility. Ask the administrator.");
    return f;
  }
}
