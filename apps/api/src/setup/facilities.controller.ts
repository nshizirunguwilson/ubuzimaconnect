import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import { bedCapacity, facilityProfile, provinceOf } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { bedUsage, freeBeds } from "./beds";

/** The facility form's values as database columns. The province follows from the district. */
function profileData(profile: ReturnType<typeof facilityProfile.parse>) {
  return {
    name: profile.name,
    level: profile.level,
    services: profile.services,
    province: provinceOf(profile.district)!,
    district: profile.district,
    sector: profile.sector || null,
    latitude: profile.latitude,
    longitude: profile.longitude,
    phone: profile.phone || null,
    active: profile.active,
  };
}

/** Facilities: the administrator sees and creates them; a facility manager keeps their own one up to date. */
@Controller("facilities")
export class FacilitiesController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  @Get()
  @Auth({ kind: "staff", roles: ["ADMIN"] })
  async list() {
    const facilities = await this.db.client.facility.findMany({
      orderBy: { name: "asc" },
      include: {
        staff: { where: { role: "FACILITY_MANAGER", status: { not: "DEACTIVATED" } }, select: { name: true } },
      },
    });
    return Promise.all(
      facilities.map(async ({ staff: managers, ...facility }) => ({
        ...facility,
        managers: managers.map((manager) => manager.name),
        availableBeds: await freeBeds(this.db.client, facility),
      })),
    );
  }

  @Post()
  @Auth({ kind: "staff", roles: ["ADMIN"] })
  async create(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const profile = parse(facilityProfile, body);
    const facility = await this.db.client.facility.create({ data: profileData(profile) });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "facility.created",
      { facilityId: facility.id, name: facility.name },
      request.ip,
    );
    return { id: facility.id };
  }

  /** The facility manager's own facility, with its bed counts. */
  @Get("mine")
  @Auth({ kind: "staff", roles: ["FACILITY_MANAGER"] })
  async mine(@CurrentSession() session: LiveSession) {
    const facility = await this.ownFacility(session);
    const { occupied, reserved } = await bedUsage(this.db.client, facility.id);
    return {
      ...facility,
      occupiedBeds: occupied,
      reservedBeds: reserved,
      availableBeds: facility.totalBeds - occupied - reserved,
    };
  }

  @Put("mine")
  @Auth({ kind: "staff", roles: ["FACILITY_MANAGER"] })
  async update(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const facility = await this.ownFacility(session);
    const profile = parse(facilityProfile, body);
    await this.db.client.facility.update({ where: { id: facility.id }, data: profileData(profile) });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "facility.profile.updated",
      { facilityId: facility.id, active: profile.active, services: profile.services },
      request.ip,
    );
    return { ok: true };
  }

  /** Changes the total number of beds. It can't go below the beds occupied or reserved now. */
  @Put("mine/beds")
  @Auth({ kind: "staff", roles: ["FACILITY_MANAGER"] })
  async beds(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const facility = await this.ownFacility(session);
    const { totalBeds } = parse(bedCapacity, body);

    const { occupied, reserved } = await bedUsage(this.db.client, facility.id);
    const inUse = occupied + reserved;
    if (totalBeds < inUse) {
      const message = `${inUse} beds are occupied or reserved, so the total can't be lower than ${inUse}.`;
      throw new ApiException(400, "VALIDATION", message, { fields: { totalBeds: message } });
    }

    await this.db.client.facility.update({ where: { id: facility.id }, data: { totalBeds } });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "facility.beds.updated",
      { facilityId: facility.id, from: facility.totalBeds, to: totalBeds },
      request.ip,
    );
    return { ok: true };
  }

  private async ownFacility(session: LiveSession) {
    const facilityId = session.staff?.facilityId;
    const facility = facilityId ? await this.db.client.facility.findUnique({ where: { id: facilityId } }) : null;
    if (!facility) {
      throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility. Ask the administrator.");
    }
    return facility;
  }
}
