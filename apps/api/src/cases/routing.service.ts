import { Injectable } from "@nestjs/common";
import { currentShift, distanceKm, matchFacilities, type Service } from "@ubuzima/shared";
import type { NotificationKind } from "@ubuzima/db";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { EventsService } from "../live/events.service";
import { FacilityDataService } from "./facilities.service";

const ROUTING_VALID_MS = 24 * 3_600_000; // FR 5.6
const BED_HOLD_MS = 6 * 3_600_000; // FR 5.7
const ACTIVE = ["SUGGESTED", "CONFIRMED"] as const;

/**
 * FR 5.1 to 5.12: facility options, routings, bed reservations and the attending clinician.
 * Used by the patient flow (automatic routing for red flags) and by the agent.
 */
@Injectable()
export class RoutingService {
  constructor(
    private db: DbService,
    private facilities: FacilityDataService,
    private audit: AuditService,
    private events: EventsService,
  ) {}

  /** FR 5.12: on-duty clinicians at the facility, the needed specialty first, fewest active patients first. */
  async clinicians(facilityId: string, service: Service) {
    const { date, shift } = currentShift();
    const onDuty = await this.db.client.staff.findMany({
      where: {
        role: "CLINICIAN",
        status: "ACTIVE",
        facilityId,
        shifts: { some: { date: new Date(`${date}T00:00:00Z`), shift, unavailable: false } },
      },
      select: { id: true, name: true, specialty: true, _count: { select: { attending: { where: { status: { in: ["SUGGESTED", "CONFIRMED", "ARRIVED"] } } } } } },
    });
    return onDuty
      .map((c) => ({ id: c.id, name: c.name, specialty: c.specialty, activePatients: c._count.attending }))
      .sort((a, b) => Number(b.specialty === service) - Number(a.specialty === service) || a.activePatients - b.activePatients);
  }

  /** Every facility the agent can choose, with what makes it suitable or not (FR 5.3, 5.4, 5.8, 5.9). */
  async options(caseId: string, service: Service, bedNeeded: boolean) {
    const c = await this.db.client.case.findUniqueOrThrow({ where: { id: caseId } });
    const all = await this.facilities.forMatching();
    const at = c.latitude !== null && c.longitude !== null ? { lat: c.latitude, lng: c.longitude } : null;
    const match = at ? matchFacilities(all, at, service, bedNeeded) : { kind: "NO_MATCH" as const };
    const list = all
      .filter((f) => f.active && f.services.includes(service))
      .map((f) => ({
        id: f.id,
        name: f.name,
        km: at ? distanceKm(at, { lat: f.latitude, lng: f.longitude }) : null,
        freeBeds: f.freeBeds,
        specialtyOnDuty: f.onDuty.includes(service),
        suitable: f.onDuty.includes(service) && (!bedNeeded || f.freeBeds > 0),
      }))
      .sort((a, b) => Number(b.suitable) - Number(a.suitable) || (a.km ?? 0) - (b.km ?? 0));
    const nearestId = match.kind === "NO_MATCH" ? null : match.facility.id;
    return { kind: match.kind, nearestId, facilities: list };
  }

  /**
   * Gives a facility to the patient. Ends the previous routing and releases its bed (FR 5.10),
   * holds a bed when one is needed (FR 5.7), and assigns the attending clinician (FR 5.12).
   */
  async route(input: {
    caseId: string;
    facilityId: string;
    service: Service;
    bedNeeded: boolean;
    status: "SUGGESTED" | "CONFIRMED";
    byStaffId: string | null;
    reason?: string;
    clinicianId?: string;
    clinicianReason?: string;
  }) {
    const c = await this.db.client.case.findUniqueOrThrow({ where: { id: input.caseId } });
    const opts = await this.options(input.caseId, input.service, input.bedNeeded);
    const chosen = opts.facilities.find((f) => f.id === input.facilityId);
    if (!chosen) throw new ApiException(400, "VALIDATION", "This facility doesn't offer the needed service or isn't active.");
    // FR 5.6: a reason when the agent doesn't choose the nearest suitable facility.
    if (input.status === "CONFIRMED" && opts.nearestId && input.facilityId !== opts.nearestId && !input.reason) {
      throw new ApiException(400, "VALIDATION", "Give a reason for not choosing the nearest facility", {
        fields: { reason: "Give a reason for not choosing the nearest facility" },
      });
    }

    const clinicians = await this.clinicians(input.facilityId, input.service);
    let clinician = input.clinicianId ? clinicians.find((x) => x.id === input.clinicianId) : clinicians.find((x) => x.specialty === input.service);
    if (input.clinicianId && !clinician) throw new ApiException(400, "VALIDATION", "This clinician isn't on duty at that facility.");
    if (clinician && clinician.specialty !== input.service && !input.clinicianReason) {
      throw new ApiException(400, "VALIDATION", "Give a reason for choosing a clinician of another specialty", {
        fields: { clinicianReason: "Give a reason for choosing a clinician of another specialty" },
      });
    }
    if (!clinician && input.status === "SUGGESTED") clinician = undefined;

    // A suggestion confirmed at the same facility keeps its bed; anything else replaces it.
    const current = await this.db.client.routing.findFirst({ where: { caseId: c.id, status: { in: [...ACTIVE] } }, include: { reservation: true } });
    if (current && current.facilityId === input.facilityId && current.status === "SUGGESTED" && input.status === "CONFIRMED") {
      const updated = await this.db.client.routing.update({
        where: { id: current.id },
        data: {
          status: "CONFIRMED",
          bedNeeded: input.bedNeeded,
          reason: input.reason ?? null,
          clinicianId: clinician?.id ?? current.clinicianId,
          clinicianReason: input.clinicianReason ?? null,
          createdById: input.byStaffId,
          confirmedAt: new Date(),
          expiresAt: new Date(Date.now() + ROUTING_VALID_MS),
        },
      });
      await this.syncBed(updated.id, input.facilityId, input.bedNeeded, chosen.freeBeds + (current.reservation?.status === "HELD" ? 1 : 0));
      await this.after(c.id, updated.id, input.byStaffId, "routing.confirmed", clinician?.id ?? updated.clinicianId);
      return updated;
    }
    if (current) await this.end(current.id, "CHANGED", "Routing changed");

    const routing = await this.db.client.routing.create({
      data: {
        caseId: c.id,
        facilityId: input.facilityId,
        service: input.service,
        bedNeeded: input.bedNeeded,
        reason: input.reason ?? null,
        clinicianId: clinician?.id ?? null,
        clinicianReason: input.clinicianReason ?? null,
        status: input.status,
        distanceKm: chosen.km,
        createdById: input.byStaffId,
        confirmedAt: input.status === "CONFIRMED" ? new Date() : null,
        expiresAt: input.status === "CONFIRMED" ? new Date(Date.now() + ROUTING_VALID_MS) : null,
      },
    });
    await this.syncBed(routing.id, input.facilityId, input.bedNeeded, chosen.freeBeds);
    await this.after(c.id, routing.id, input.byStaffId, input.status === "CONFIRMED" ? (current ? "routing.changed" : "routing.confirmed") : "routing.suggested", clinician?.id ?? null);
    if (!clinician) await this.audit.record({ type: "system" }, "routing.no_clinician", { caseId: c.id, facilityId: input.facilityId });
    return routing;
  }

  /** Ends the active routing (case cancelled or closed) and gives its bed back. */
  async endActive(caseId: string, status: "CANCELLED" | "CHANGED", reason: string) {
    const current = await this.db.client.routing.findFirst({ where: { caseId, status: { in: [...ACTIVE] } } });
    if (current) await this.end(current.id, status, reason);
  }

  private async end(routingId: string, status: "CANCELLED" | "CHANGED", reason: string) {
    const r = await this.db.client.routing.update({ where: { id: routingId }, data: { status, endedAt: new Date() } });
    this.events.emit(`facility:${r.facilityId}`, { type: "incoming" });
    const released = await this.db.client.bedReservation.updateMany({
      where: { routingId, status: "HELD" },
      data: { status: "RELEASED", releasedAt: new Date(), releaseReason: reason },
    });
    if (released.count) await this.audit.record({ type: "system" }, "bed.released", { routingId, reason });
  }

  /** FR 5.7: hold exactly one bed when one is needed and one is free; none otherwise. */
  private async syncBed(routingId: string, facilityId: string, bedNeeded: boolean, freeBeds: number) {
    const existing = await this.db.client.bedReservation.findUnique({ where: { routingId } });
    if (bedNeeded && !existing && freeBeds > 0) {
      await this.db.client.bedReservation.create({ data: { routingId, facilityId, releaseAfter: new Date(Date.now() + BED_HOLD_MS) } });
      await this.audit.record({ type: "system" }, "bed.reserved", { routingId, facilityId });
    } else if (!bedNeeded && existing?.status === "HELD") {
      await this.db.client.bedReservation.update({ where: { routingId }, data: { status: "RELEASED", releasedAt: new Date(), releaseReason: "Bed no longer needed" } });
    }
  }

  /**
   * FR 7.9: the nearest suitable facility with a free bed, measured from the current facility.
   * The patient's own facility is left out: it has no free bed, which is why they are transferred.
   */
  async transferTarget(routingId: string) {
    const r = await this.db.client.routing.findUniqueOrThrow({ where: { id: routingId }, include: { facility: true } });
    const others = (await this.facilities.forMatching()).filter((f) => f.id !== r.facilityId);
    const match = matchFacilities(others, { lat: r.facility.latitude, lng: r.facility.longitude }, r.service as Service, true);
    if (match.kind !== "SUITABLE") return null;
    const [clinician] = await this.clinicians(match.facility.id, r.service as Service);
    return { facility: match.facility, km: match.km, clinician: clinician ?? null };
  }

  /**
   * FR 7.9: a new confirmed routing at the target with a held bed and an attending clinician; the patient
   * shows as incoming there, and the current visit closes as Transferred (its bed was never used).
   */
  async transfer(routingId: string, byStaffId: string) {
    const target = await this.transferTarget(routingId);
    if (!target) throw new ApiException(409, "CONFLICT", "No other facility has a free bed and this specialty on duty right now. Call 912 for an ambulance transfer.");
    const from = await this.db.client.routing.findUniqueOrThrow({ where: { id: routingId }, include: { facility: true } });
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
    await this.db.client.routing.update({ where: { id: routingId }, data: { status: "TRANSFERRED", endedAt: new Date() } });
    await this.audit.record({ type: "staff", id: byStaffId }, "patient.transferred", { caseId: from.caseId, from: routingId, to: next.id, facilityId: target.facility.id });
    this.events.emit(`facility:${from.facilityId}`, { type: "incoming" });
    await this.after(from.caseId, next.id, byStaffId, "routing.confirmed", next.clinicianId);
    return { routing: next, facility: target.facility, clinician: target.clinician };
  }

  /**
   * FR 5.13: the attending clinician of patients still on the way can no longer take them (marked unavailable
   * for the current shift, or deactivated). Each patient goes to the on-duty colleague of the same specialty with
   * the fewest active patients, who is told. With none, the agent is alerted so another facility can be chosen:
   * the agent handling the case, or, if the case was already closed, the queue, where it goes first.
   */
  async reassignFrom(clinicianId: string, why: string) {
    const routings = await this.db.client.routing.findMany({ where: { clinicianId, status: { in: [...ACTIVE] } }, include: { facility: true, case: true } });
    for (const r of routings) {
      const next = (await this.clinicians(r.facilityId, r.service as Service)).find((c) => c.id !== clinicianId && c.specialty === r.service);
      await this.db.client.routing.update({ where: { id: r.id }, data: { clinicianId: next?.id ?? null, clinicianReason: null } });
      this.events.emit(`facility:${r.facilityId}`, { type: "incoming" });
      if (next) {
        await this.notify(next.id, "INCOMING", r.id);
        await this.audit.record({ type: "system" }, "routing.clinician_reassigned", { routingId: r.id, from: clinicianId, to: next.id, why });
        continue;
      }
      await this.audit.record({ type: "system" }, "routing.no_clinician", { routingId: r.id, from: clinicianId, why });
      const text = `No ${r.service.toLowerCase().replace(/_/g, " ")} clinician is on duty at ${r.facility.name} any more. Choose another facility for ${r.case.code}.`;
      if (r.case.status === "ASSIGNED" && r.case.agentId) {
        this.events.emit(`agent:${r.case.agentId}`, { type: "alert", caseId: r.caseId, text });
        this.events.emit(`case:${r.caseId}`, { type: "case", caseId: r.caseId });
      } else {
        await this.db.client.case.update({
          where: { id: r.caseId },
          data: { status: "QUEUED", agentId: null, offeredToId: null, offerExpiresAt: null, outcome: null, closedAt: null, frontOfQueue: true, queuedAt: new Date(), escalationLevel: 0, escalatedAt: null },
        });
        const m = await this.db.client.chatMessage.create({ data: { caseId: r.caseId, sender: "SYSTEM", text: `${r.facility.name} can't receive you right now. A health agent will choose another place for you. If you get worse, call 912.` } });
        this.events.emit(`case:${r.caseId}`, { type: "message", caseId: r.caseId, message: { id: m.id, sender: "SYSTEM", text: m.text, createdAt: m.createdAt.toISOString() } });
        this.events.emit(`case:${r.caseId}`, { type: "case", caseId: r.caseId });
        this.events.emit("agents", { type: "queue" });
      }
    }
    return routings.length;
  }

  /** FR 5.12, 7.11: saved so it is still there after a reload; pushed live to an open app. */
  async notify(staffId: string, kind: NotificationKind, routingId: string) {
    await this.db.client.notification.create({ data: { staffId, kind, routingId } });
    this.events.emit(`staff:${staffId}`, { type: "notice", kind, routingId });
  }

  private async after(caseId: string, routingId: string, byStaffId: string | null, action: string, clinicianId: string | null) {
    await this.audit.record(byStaffId ? { type: "staff", id: byStaffId } : { type: "system" }, action, { caseId, routingId, clinicianId });
    this.events.emit(`case:${caseId}`, { type: "case", caseId });
    const r = await this.db.client.routing.findUniqueOrThrow({ where: { id: routingId } });
    this.events.emit(`facility:${r.facilityId}`, { type: "incoming" });
    // FR 5.12: the assigned clinician is told, once per routing (confirming a suggestion keeps the same one).
    if (clinicianId && !(await this.db.client.notification.count({ where: { routingId, staffId: clinicianId } }))) {
      await this.notify(clinicianId, "INCOMING", routingId);
    }
  }
}
