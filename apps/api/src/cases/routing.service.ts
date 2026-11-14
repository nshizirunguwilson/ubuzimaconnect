import { Injectable } from "@nestjs/common";
import { currentShift, distanceKm, matchFacilities, type Service } from "@ubuzima/shared";
import type { NotificationKind } from "@ubuzima/db";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { ChatService } from "../live/chat.service";
import { EventsService } from "../live/events.service";
import { FacilityDataService } from "./facilities.service";

/** A confirmed routing is valid for 24 hours. */
const ROUTING_VALID_MS = 24 * 3_600_000;
/** A bed is held for the patient for 6 hours. */
const BED_HOLD_MS = 6 * 3_600_000;
/** Routings where the patient is still on their way. */
const ACTIVE = ["SUGGESTED", "CONFIRMED"] as const;

type RouteRequest = {
  caseId: string;
  facilityId: string;
  service: Service;
  bedNeeded: boolean;
  status: "SUGGESTED" | "CONFIRMED";
  byStaffId: string | null;
  reason?: string;
  clinicianId?: string;
  clinicianReason?: string;
};

/** "INTERNAL_MEDICINE" becomes "internal medicine". */
function serviceInWords(service: string) {
  return service.toLowerCase().replace(/_/g, " ");
}

/**
 * Where patients go: the list of facility options, routings, bed reservations and the attending clinician.
 * Used by the patient flow (automatic routing after a danger sign) and by the agent.
 */
@Injectable()
export class RoutingService {
  constructor(
    private db: DbService,
    private facilities: FacilityDataService,
    private audit: AuditService,
    private events: EventsService,
    private chat: ChatService,
  ) {}

  /** Clinicians on duty at the facility now: the needed specialty first, then whoever has the fewest active patients. */
  async clinicians(facilityId: string, service: Service) {
    const { date, shift } = currentShift();
    const onDuty = await this.db.client.staff.findMany({
      where: {
        role: "CLINICIAN",
        status: "ACTIVE",
        facilityId,
        shifts: { some: { date: new Date(`${date}T00:00:00Z`), shift, unavailable: false } },
      },
      select: {
        id: true,
        name: true,
        specialty: true,
        _count: { select: { attending: { where: { status: { in: ["SUGGESTED", "CONFIRMED", "ARRIVED"] } } } } },
      },
    });

    const clinicians = onDuty.map((clinician) => ({
      id: clinician.id,
      name: clinician.name,
      specialty: clinician.specialty,
      activePatients: clinician._count.attending,
    }));

    return clinicians.sort((a, b) => {
      const aHasSpecialty = a.specialty === service;
      const bHasSpecialty = b.specialty === service;
      if (aHasSpecialty !== bHasSpecialty) return aHasSpecialty ? -1 : 1;
      return a.activePatients - b.activePatients;
    });
  }

  /** Every facility the agent can choose from, with what makes each one suitable or not. Suitable ones first, then the nearest. */
  async options(caseId: string, service: Service, bedNeeded: boolean) {
    const found = await this.db.client.case.findUniqueOrThrow({ where: { id: caseId } });
    const allFacilities = await this.facilities.forMatching();

    const patientAt =
      found.latitude !== null && found.longitude !== null ? { lat: found.latitude, lng: found.longitude } : null;
    const match = patientAt
      ? matchFacilities(allFacilities, patientAt, service, bedNeeded)
      : ({ kind: "NO_MATCH" } as const);

    const facilities = allFacilities
      .filter((facility) => facility.active && facility.services.includes(service))
      .map((facility) => {
        const specialtyOnDuty = facility.onDuty.includes(service);
        return {
          id: facility.id,
          name: facility.name,
          km: patientAt ? distanceKm(patientAt, { lat: facility.latitude, lng: facility.longitude }) : null,
          freeBeds: facility.freeBeds,
          specialtyOnDuty,
          suitable: specialtyOnDuty && (!bedNeeded || facility.freeBeds > 0),
        };
      })
      .sort((a, b) => {
        if (a.suitable !== b.suitable) return a.suitable ? -1 : 1;
        return (a.km ?? 0) - (b.km ?? 0);
      });

    const nearestId = match.kind === "NO_MATCH" ? null : match.facility.id;
    return { kind: match.kind, nearestId, facilities };
  }

  /**
   * Gives a facility to the patient: ends the previous routing and releases its bed, holds a bed when one
   * is needed, and assigns the attending clinician.
   */
  async route(request: RouteRequest) {
    const found = await this.db.client.case.findUniqueOrThrow({ where: { id: request.caseId } });
    const options = await this.options(request.caseId, request.service, request.bedNeeded);
    const chosen = options.facilities.find((facility) => facility.id === request.facilityId);
    if (!chosen) {
      throw new ApiException(400, "VALIDATION", "This facility doesn't offer the needed service or isn't active.");
    }

    const notTheNearest = options.nearestId !== null && request.facilityId !== options.nearestId;
    if (request.status === "CONFIRMED" && notTheNearest && !request.reason) {
      const message = "Give a reason for not choosing the nearest facility";
      throw new ApiException(400, "VALIDATION", message, { fields: { reason: message } });
    }

    const clinician = await this.chooseClinician(request);

    const current = await this.db.client.routing.findFirst({
      where: { caseId: found.id, status: { in: [...ACTIVE] } },
      include: { reservation: true },
    });

    // Confirming a suggestion at the same facility keeps the same routing and its bed. Anything else replaces it.
    const confirmingSuggestion =
      current &&
      current.facilityId === request.facilityId &&
      current.status === "SUGGESTED" &&
      request.status === "CONFIRMED";

    if (confirmingSuggestion) {
      const updated = await this.db.client.routing.update({
        where: { id: current.id },
        data: {
          status: "CONFIRMED",
          bedNeeded: request.bedNeeded,
          reason: request.reason ?? null,
          clinicianId: clinician?.id ?? current.clinicianId,
          clinicianReason: request.clinicianReason ?? null,
          createdById: request.byStaffId,
          confirmedAt: new Date(),
          expiresAt: new Date(Date.now() + ROUTING_VALID_MS),
        },
      });
      // The bed this routing already holds counts as free for itself.
      const ownHeldBed = current.reservation?.status === "HELD" ? 1 : 0;
      await this.syncBed(updated.id, request.facilityId, request.bedNeeded, chosen.freeBeds + ownHeldBed);
      await this.afterRouting(
        found.id,
        updated.id,
        request.byStaffId,
        "routing.confirmed",
        clinician?.id ?? updated.clinicianId,
      );
      return updated;
    }

    if (current) await this.end(current.id, "CHANGED", "Routing changed");

    const isConfirmed = request.status === "CONFIRMED";
    const routing = await this.db.client.routing.create({
      data: {
        caseId: found.id,
        facilityId: request.facilityId,
        service: request.service,
        bedNeeded: request.bedNeeded,
        reason: request.reason ?? null,
        clinicianId: clinician?.id ?? null,
        clinicianReason: request.clinicianReason ?? null,
        status: request.status,
        distanceKm: chosen.km,
        createdById: request.byStaffId,
        confirmedAt: isConfirmed ? new Date() : null,
        expiresAt: isConfirmed ? new Date(Date.now() + ROUTING_VALID_MS) : null,
      },
    });
    await this.syncBed(routing.id, request.facilityId, request.bedNeeded, chosen.freeBeds);

    let action = "routing.suggested";
    if (isConfirmed) action = current ? "routing.changed" : "routing.confirmed";
    await this.afterRouting(found.id, routing.id, request.byStaffId, action, clinician?.id ?? null);

    if (!clinician) {
      await this.audit.record({ type: "system" }, "routing.no_clinician", {
        caseId: found.id,
        facilityId: request.facilityId,
      });
    }
    return routing;
  }

  /**
   * The clinician the agent picked, or else the on-duty clinician of the needed specialty with the fewest patients.
   * Picking a clinician of another specialty needs a reason. Undefined when nobody suitable is on duty.
   */
  private async chooseClinician(request: RouteRequest) {
    const onDuty = await this.clinicians(request.facilityId, request.service);

    const clinician = request.clinicianId
      ? onDuty.find((candidate) => candidate.id === request.clinicianId)
      : onDuty.find((candidate) => candidate.specialty === request.service);

    if (request.clinicianId && !clinician) {
      throw new ApiException(400, "VALIDATION", "This clinician isn't on duty at that facility.");
    }
    if (clinician && clinician.specialty !== request.service && !request.clinicianReason) {
      const message = "Give a reason for choosing a clinician of another specialty";
      throw new ApiException(400, "VALIDATION", message, { fields: { clinicianReason: message } });
    }
    return clinician;
  }

  /** Ends the active routing (the case was cancelled or closed) and gives its bed back. */
  async endActive(caseId: string, status: "CANCELLED" | "CHANGED", reason: string) {
    const current = await this.db.client.routing.findFirst({ where: { caseId, status: { in: [...ACTIVE] } } });
    if (current) await this.end(current.id, status, reason);
  }

  private async end(routingId: string, status: "CANCELLED" | "CHANGED", reason: string) {
    const routing = await this.db.client.routing.update({
      where: { id: routingId },
      data: { status, endedAt: new Date() },
    });
    this.events.emit(`facility:${routing.facilityId}`, { type: "incoming" });

    const released = await this.db.client.bedReservation.updateMany({
      where: { routingId, status: "HELD" },
      data: { status: "RELEASED", releasedAt: new Date(), releaseReason: reason },
    });
    if (released.count > 0) {
      await this.audit.record({ type: "system" }, "bed.released", { routingId, reason });
    }
  }

  /** Holds exactly one bed when one is needed and one is free, and none otherwise. */
  private async syncBed(routingId: string, facilityId: string, bedNeeded: boolean, freeBeds: number) {
    const existing = await this.db.client.bedReservation.findUnique({ where: { routingId } });

    if (bedNeeded && !existing && freeBeds > 0) {
      await this.db.client.bedReservation.create({
        data: { routingId, facilityId, releaseAfter: new Date(Date.now() + BED_HOLD_MS) },
      });
      await this.audit.record({ type: "system" }, "bed.reserved", { routingId, facilityId });
      return;
    }

    if (!bedNeeded && existing?.status === "HELD") {
      await this.db.client.bedReservation.update({
        where: { routingId },
        data: { status: "RELEASED", releasedAt: new Date(), releaseReason: "Bed no longer needed" },
      });
    }
  }

  /**
   * Where to transfer a patient who needs a bed: the nearest suitable facility with a free bed, measured from
   * the current facility. The current facility is left out: it has no free bed, which is why they are moving.
   */
  async transferTarget(routingId: string) {
    const routing = await this.db.client.routing.findUniqueOrThrow({
      where: { id: routingId },
      include: { facility: true },
    });
    const service = routing.service as Service;

    const otherFacilities = (await this.facilities.forMatching()).filter(
      (facility) => facility.id !== routing.facilityId,
    );
    const from = { lat: routing.facility.latitude, lng: routing.facility.longitude };
    const match = matchFacilities(otherFacilities, from, service, true);
    if (match.kind !== "SUITABLE") return null;

    const [clinician] = await this.clinicians(match.facility.id, service);
    return { facility: match.facility, km: match.km, clinician: clinician ?? null };
  }

  /**
   * Moves a patient to another facility: a new confirmed routing there with a held bed and an attending clinician,
   * so the patient shows as incoming there. The current visit ends as Transferred (its bed was never used).
   */
  async transfer(routingId: string, byStaffId: string) {
    const target = await this.transferTarget(routingId);
    if (!target) {
      throw new ApiException(
        409,
        "CONFLICT",
        "No other facility has a free bed and this specialty on duty right now. Call 912 for an ambulance transfer.",
      );
    }

    const from = await this.db.client.routing.findUniqueOrThrow({
      where: { id: routingId },
      include: { facility: true },
    });
    const next = await this.db.client.routing.create({
      data: {
        caseId: from.caseId,
        facilityId: target.facility.id,
        service: from.service,
        bedNeeded: true,
        reason: `Transferred from ${from.facility.name}: no free bed`,
        clinicianId: target.clinician?.id ?? null,
        status: "CONFIRMED",
        distanceKm: target.km,
        createdById: byStaffId,
        confirmedAt: new Date(),
        expiresAt: new Date(Date.now() + ROUTING_VALID_MS),
      },
    });
    await this.syncBed(next.id, target.facility.id, true, target.facility.freeBeds);
    await this.db.client.routing.update({
      where: { id: routingId },
      data: { status: "TRANSFERRED", endedAt: new Date() },
    });

    await this.audit.record({ type: "staff", id: byStaffId }, "patient.transferred", {
      caseId: from.caseId,
      from: routingId,
      to: next.id,
      facilityId: target.facility.id,
    });
    this.events.emit(`facility:${from.facilityId}`, { type: "incoming" });
    await this.afterRouting(from.caseId, next.id, byStaffId, "routing.confirmed", next.clinicianId);
    return { routing: next, facility: target.facility, clinician: target.clinician };
  }

  /**
   * The attending clinician of patients still on their way can no longer take them (marked unavailable for
   * this shift, or deactivated). Each patient goes to the on-duty colleague of the same specialty with the
   * fewest active patients, who is told. When there is nobody, an agent must choose another facility:
   * the agent handling the case is alerted, or, if the case was already closed, it goes back to the front of the queue.
   */
  async reassignFrom(clinicianId: string, why: string) {
    const routings = await this.db.client.routing.findMany({
      where: { clinicianId, status: { in: [...ACTIVE] } },
      include: { facility: true, case: true },
    });

    for (const routing of routings) {
      const colleagues = await this.clinicians(routing.facilityId, routing.service as Service);
      const colleague = colleagues.find(
        (candidate) => candidate.id !== clinicianId && candidate.specialty === routing.service,
      );

      await this.db.client.routing.update({
        where: { id: routing.id },
        data: { clinicianId: colleague?.id ?? null, clinicianReason: null },
      });
      this.events.emit(`facility:${routing.facilityId}`, { type: "incoming" });

      if (colleague) {
        await this.notify(colleague.id, "INCOMING", routing.id);
        await this.audit.record({ type: "system" }, "routing.clinician_reassigned", {
          routingId: routing.id,
          from: clinicianId,
          to: colleague.id,
          why,
        });
        continue;
      }

      await this.audit.record({ type: "system" }, "routing.no_clinician", {
        routingId: routing.id,
        from: clinicianId,
        why,
      });

      const agentStillHasCase = routing.case.status === "ASSIGNED" && routing.case.agentId;
      if (agentStillHasCase) {
        const text =
          `No ${serviceInWords(routing.service)} clinician is on duty at ${routing.facility.name} any more. ` +
          `Choose another facility for ${routing.case.code}.`;
        this.events.emit(`agent:${routing.case.agentId}`, { type: "alert", caseId: routing.caseId, text });
        this.events.emit(`case:${routing.caseId}`, { type: "case", caseId: routing.caseId });
      } else {
        await this.reopenForAnotherFacility(routing.caseId, routing.facility.name);
      }
    }
    return routings.length;
  }

  /** Puts a closed case back at the front of the queue, and tells the patient an agent will find another place. */
  private async reopenForAnotherFacility(caseId: string, facilityName: string) {
    await this.db.client.case.update({
      where: { id: caseId },
      data: {
        status: "QUEUED",
        agentId: null,
        offeredToId: null,
        offerExpiresAt: null,
        outcome: null,
        closedAt: null,
        frontOfQueue: true,
        queuedAt: new Date(),
        escalationLevel: 0,
        escalatedAt: null,
      },
    });

    await this.chat.post(
      caseId,
      "SYSTEM",
      `${facilityName} can't receive you right now. A health agent will choose another place for you. If you get worse, call 912.`,
    );
    this.events.emit(`case:${caseId}`, { type: "case", caseId });
    this.events.emit("agents", { type: "queue" });
  }

  /** Tells a clinician about a patient. Saved so it is still there after a reload, and pushed live to an open app. */
  async notify(staffId: string, kind: NotificationKind, routingId: string) {
    await this.db.client.notification.create({ data: { staffId, kind, routingId } });
    this.events.emit(`staff:${staffId}`, { type: "notice", kind, routingId });
  }

  /** Logs the routing, updates open screens, and tells the clinician (once per routing). */
  private async afterRouting(
    caseId: string,
    routingId: string,
    byStaffId: string | null,
    action: string,
    clinicianId: string | null,
  ) {
    const actor = byStaffId ? ({ type: "staff", id: byStaffId } as const) : ({ type: "system" } as const);
    await this.audit.record(actor, action, { caseId, routingId, clinicianId });
    this.events.emit(`case:${caseId}`, { type: "case", caseId });

    const routing = await this.db.client.routing.findUniqueOrThrow({ where: { id: routingId } });
    this.events.emit(`facility:${routing.facilityId}`, { type: "incoming" });

    // Confirming a suggestion keeps the same clinician, who has already been told.
    if (clinicianId) {
      const alreadyTold = await this.db.client.notification.count({ where: { routingId, staffId: clinicianId } });
      if (alreadyTold === 0) await this.notify(clinicianId, "INCOMING", routingId);
    }
  }
}
