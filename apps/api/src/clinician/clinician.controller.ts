import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from "@nestjs/common";
import { age, ageLabel, arrivalIssue, clinicalEntry, currentShift, handover, prescription } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { uuid7 } from "../common/crypto";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { RoutingService } from "../cases/routing.service";
import { EventsService } from "../live/events.service";
import { PrescriptionsService } from "../prescriptions/prescriptions.service";
import { bedUsage } from "../setup/beds";

const INCOMING = ["SUGGESTED", "CONFIRMED"] as const;

/**
 * The clinician's work at a facility (FR 7.4 to 7.11). Incoming patients show a summary only, to every
 * on-duty clinician there. Full records are for the attending clinician, during the active visit (FR 7.6).
 * The routing is the visit: Arrived is "active visit" in the SRS routing states (DECISIONS.md D39).
 */
@Controller("clinician")
@Auth({ kind: "staff", roles: ["CLINICIAN"] })
export class ClinicianController {
  constructor(
    private db: DbService,
    private routing: RoutingService,
    private events: EventsService,
    private audit: AuditService,
    private prescriptions: PrescriptionsService,
  ) {}

  /** Patients in my care, and patients on their way to my facility. */
  @Get("patients")
  async patients(@CurrentSession() s: LiveSession) {
    const me = s.staff!;
    const onDuty = await this.isOnDuty(me.id);
    const unread = await this.db.client.notification.findMany({ where: { staffId: me.id, readAt: null }, select: { routingId: true, kind: true } });
    const isNew = (routingId: string) => unread.some((n) => n.routingId === routingId);

    const visits = await this.db.client.routing.findMany({
      where: { clinicianId: me.id, status: "ARRIVED" },
      orderBy: { arrivedAt: "asc" },
      include: { case: { include: { patient: true } }, reservation: true },
    });
    const incoming =
      onDuty && me.facilityId
        ? await this.db.client.routing.findMany({
            where: { facilityId: me.facilityId, status: { in: [...INCOMING] } },
            orderBy: { createdAt: "asc" },
            include: { case: { include: { patient: true, answers: { where: { answer: true }, orderBy: { createdAt: "asc" } } } }, clinician: true, reservation: true },
          })
        : [];
    return {
      onDuty,
      visits: visits.map((v) => ({
        id: v.id,
        name: v.case.patient.fullName,
        age: ageLabel(v.case.patient.dateOfBirth),
        sex: v.case.patient.sex,
        photoUrl: v.case.patient.photoUrl,
        level: v.case.triageLevel,
        service: v.service,
        arrivedAt: v.arrivedAt,
        hasBed: v.reservation?.status === "USED",
        handedOver: unread.some((n) => n.routingId === v.id && n.kind === "HANDOVER"),
      })),
      // Most urgent first, then the order they were sent (FR 7.4).
      incoming: incoming
        .map((r) => ({ ...incomingSummary(r), attending: r.clinician ? { name: r.clinician.name, me: r.clinician.id === me.id } : null, isNew: isNew(r.id) }))
        .sort((a, b) => levelRank(a.level) - levelRank(b.level)),
    };
  }

  /** FR 7.4, 7.5: one incoming patient's summary, with the photo to compare at arrival. */
  @Get("incoming/:id")
  async incomingOne(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession) {
    const r = await this.incomingHere(id, s);
    await this.db.client.notification.updateMany({ where: { staffId: s.staffId!, routingId: id, readAt: null }, data: { readAt: new Date() } });
    const issues = await this.db.client.arrivalIssue.findMany({ where: { routingId: id }, orderBy: { createdAt: "asc" }, include: { clinician: { select: { name: true } } } });
    return {
      ...incomingSummary(r),
      attending: r.clinician ? { name: r.clinician.name, me: r.clinician.id === s.staffId } : null,
      issues: issues.map((i) => ({ id: i.id, note: i.note, by: i.clinician.name, at: i.createdAt })),
    };
  }

  /** FR 7.5: the person matches the photo. The visit starts and a held bed becomes the patient's. */
  @Post("incoming/:id/arrive")
  @HttpCode(200)
  async arrive(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const r = await this.incomingHere(id, s);
    // Only one clinician can mark arrival: the update succeeds only while the patient is still incoming.
    const done = await this.db.client.routing.updateMany({
      where: { id, status: { in: [...INCOMING] } },
      data: { status: "ARRIVED", arrivedAt: new Date(), arrivedById: s.staffId!, clinicianId: r.clinicianId ?? s.staffId! },
    });
    if (done.count === 0) throw new ApiException(409, "CONFLICT", "This patient was already marked arrived.");
    const bed = await this.db.client.bedReservation.updateMany({ where: { routingId: id, status: "HELD" }, data: { status: "USED" } });
    await this.audit.record({ type: "staff", id: s.staffId }, "patient.arrived", { routingId: id, caseId: r.caseId, bedUsed: bed.count > 0 }, req.ip);
    if (!r.clinicianId) await this.audit.record({ type: "system" }, "routing.clinician_assigned", { routingId: id, clinicianId: s.staffId });
    // An urgent patient can arrive before any agent took the case. It leaves the queue: the patient is in care.
    const closed = await this.db.client.case.updateMany({
      where: { id: r.caseId, status: { in: ["SUBMITTED", "QUEUED", "OFFERED"] } },
      data: { status: "CLOSED", outcome: "ROUTED_TO_FACILITY", closingNote: "Arrived at the facility before an agent took the case.", closedAt: new Date(), offeredToId: null, offerExpiresAt: null },
    });
    if (closed.count) this.events.emit("agents", { type: "queue" });
    this.events.emit(`facility:${r.facilityId}`, { type: "incoming" });
    this.events.emit(`case:${r.caseId}`, { type: "case", caseId: r.caseId });
    return { attending: (r.clinicianId ?? s.staffId) === s.staffId };
  }

  /** FR 7.5: the person doesn't match the photo. They stay incoming and the issue is recorded. */
  @Post("incoming/:id/issue")
  async issue(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const r = await this.incomingHere(id, s);
    const { note } = parse(arrivalIssue, body);
    const i = await this.db.client.arrivalIssue.create({ data: { routingId: id, clinicianId: s.staffId!, note } });
    await this.audit.record({ type: "staff", id: s.staffId }, "arrival.mismatch", { routingId: id, caseId: r.caseId }, req.ip);
    return { id: i.id };
  }

  /** FR 7.6, 7.3: the full record, from every facility, for the attending clinician during the visit. */
  @Get("visits/:id")
  async visit(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const v = await this.myVisit(id, s);
    await this.db.client.notification.updateMany({ where: { staffId: s.staffId!, routingId: id, readAt: null }, data: { readAt: new Date() } });
    const c = await this.db.client.case.findUniqueOrThrow({
      where: { id: v.caseId },
      include: {
        patient: true,
        answers: { orderBy: { createdAt: "asc" } },
        calls: { orderBy: { createdAt: "asc" }, include: { staff: { select: { name: true } } } },
        agent: { select: { name: true } },
      },
    });
    const entries = await this.db.client.clinicalEntry.findMany({
      where: { patientId: c.patientId },
      orderBy: [{ createdAt: "asc" }],
      include: { author: { select: { name: true } }, routing: { include: { facility: { select: { name: true } } } } },
    });
    const history = await this.db.client.case.findMany({
      where: { patientId: c.patientId, id: { not: c.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        code: true,
        createdAt: true,
        triageLevel: true,
        outcome: true,
        closingNote: true,
        routings: { where: { arrivedAt: { not: null } }, select: { id: true, status: true, arrivedAt: true, endedAt: true, facility: { select: { name: true } } } },
      },
    });
    const usage = await bedUsage(this.db.client, v.facilityId);
    await this.audit.viewed({ type: "staff", id: s.staffId }, "record.viewed", { routingId: id, patientId: c.patientId }, req.ip);
    const a = age(c.patient.dateOfBirth);

    // Entries grouped by rootId: the latest version is shown; the earlier ones are kept as its history (FR 7.7).
    const byRoot = new Map<string, typeof entries>();
    for (const e of entries) byRoot.set(e.rootId, [...(byRoot.get(e.rootId) ?? []), e]);
    const entryView = [...byRoot.values()].map((versions) => {
      const sorted = versions.sort((x, y) => y.version - x.version);
      const [latest] = sorted;
      return {
        rootId: latest.rootId,
        thisVisit: latest.routingId === id,
        facility: latest.routing.facility.name,
        latest: version(latest),
        earlier: sorted.slice(1).map(version),
      };
    });

    return {
      id: v.id,
      status: v.status,
      facility: { id: v.facility.id, name: v.facility.name, freeBeds: v.facility.totalBeds - usage.occupied - usage.reserved },
      arrivedAt: v.arrivedAt,
      service: v.service,
      bed: v.reservation?.status === "USED" ? "USED" : "NONE",
      reason: v.reason,
      patient: {
        id: c.patient.id,
        name: c.patient.fullName,
        sex: c.patient.sex,
        age: a,
        ageLabel: ageLabel(c.patient.dateOfBirth),
        dateOfBirth: c.patient.dateOfBirth,
        district: c.patient.district,
        photoUrl: c.patient.photoUrl,
      },
      case: {
        id: c.id,
        code: c.code,
        level: c.triageLevel,
        reason: c.triageReason,
        category: c.category,
        pregnant: c.pregnant,
        answers: c.answers.map((x) => ({ code: x.code, text: x.textEn, answer: x.answer })),
        description: c.description,
        duration: c.duration,
        severity: c.severity,
        agent: c.agent?.name ?? null,
        closingNote: c.closingNote,
        calls: c.calls.map((x) => ({ id: x.id, answered: x.answered, note: x.note, by: x.staff.name, at: x.createdAt })),
      },
      entries: entryView,
      // FR 11.6: the full prescription history during the visit
      prescriptions: await this.prescriptions.forPatient(c.patientId),
      history: history.map((h) => ({
        id: h.id,
        code: h.code,
        createdAt: h.createdAt,
        level: h.triageLevel,
        outcome: h.outcome,
        closingNote: h.closingNote,
        visits: h.routings.map((r) => ({ id: r.id, facility: r.facility.name, status: r.status, arrivedAt: r.arrivedAt, endedAt: r.endedAt })),
      })),
    };
  }

  /** FR 7.7: a new entry, saved with the author and the time. */
  @Post("visits/:id/entries")
  async addEntry(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const v = await this.myVisit(id, s);
    const input = parse(clinicalEntry, body);
    const c = await this.db.client.case.findUniqueOrThrow({ where: { id: v.caseId }, select: { patientId: true } });
    // The first version is its own root.
    const entryId = uuid7();
    const e = await this.db.client.clinicalEntry.create({ data: { id: entryId, rootId: entryId, routingId: id, patientId: c.patientId, authorId: s.staffId!, ...input } });
    await this.audit.record({ type: "staff", id: s.staffId }, "record.entry_added", { routingId: id, entryId: e.id }, req.ip);
    return { id: e.id, rootId: e.rootId };
  }

  /** FR 7.7: an update is a new version; the earlier versions stay. Only this visit's entries, while it is active. */
  @Put("visits/:id/entries/:rootId")
  async updateEntry(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rootId", ParseUUIDPipe) rootId: string,
    @Body() body: unknown,
    @CurrentSession() s: LiveSession,
    @Req() req: Request,
  ) {
    await this.myVisit(id, s);
    const input = parse(clinicalEntry, body);
    const latest = await this.db.client.clinicalEntry.findFirst({ where: { rootId, routingId: id }, orderBy: { version: "desc" } });
    if (!latest) throw new ApiException(404, "NOT_FOUND", "This entry isn't part of this visit.");
    // previousVersionId is unique, so two updates of the same version can't both succeed.
    const e = await this.db.client.clinicalEntry
      .create({ data: { rootId, version: latest.version + 1, previousVersionId: latest.id, routingId: id, patientId: latest.patientId, authorId: s.staffId!, ...input } })
      .catch(() => {
        throw new ApiException(409, "CONFLICT", "Someone saved a newer version. Reload to see it.");
      });
    await this.audit.record({ type: "staff", id: s.staffId }, "record.entry_updated", { routingId: id, entryId: e.id, version: e.version }, req.ip);
    return { id: e.id, version: e.version };
  }

  /** FR 11.1: by the attending clinician during the visit, no approval needed. */
  @Post("visits/:id/prescriptions")
  async prescribe(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const v = await this.myVisit(id, s);
    const { items } = parse(prescription, body);
    const c = await this.db.client.case.findUniqueOrThrow({ where: { id: v.caseId }, select: { patientId: true } });
    return this.prescriptions.issue({ patientId: c.patientId, routingId: id, prescriberId: s.staffId!, items, ip: req.ip });
  }

  /** FR 7.8: a free bed when none was held. With none free, the answer is a transfer (FR 7.9). */
  @Post("visits/:id/bed")
  @HttpCode(200)
  async assignBed(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const v = await this.myVisit(id, s);
    if (v.reservation?.status === "USED") throw new ApiException(409, "CONFLICT", "This patient already has a bed.");
    const usage = await bedUsage(this.db.client, v.facilityId);
    if (v.facility.totalBeds - usage.occupied - usage.reserved <= 0) {
      await this.audit.record({ type: "staff", id: s.staffId }, "bed.none_free", { routingId: id, facilityId: v.facilityId }, req.ip);
      throw new ApiException(409, "NO_BED", "No bed is free here. Transfer the patient to a facility with a free bed.");
    }
    const data = { status: "USED" as const, facilityId: v.facilityId, releaseAfter: new Date(), releasedAt: null, releaseReason: null };
    await this.db.client.bedReservation.upsert({ where: { routingId: id }, create: { routingId: id, ...data }, update: data });
    await this.db.client.routing.update({ where: { id }, data: { bedNeeded: true } });
    await this.audit.record({ type: "staff", id: s.staffId }, "bed.assigned", { routingId: id, facilityId: v.facilityId }, req.ip);
    return { ok: true };
  }

  /** FR 7.9: where the patient would go. Shown before the clinician confirms. */
  @Get("visits/:id/transfer")
  async transferPreview(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession) {
    await this.canTransfer(await this.myVisit(id, s));
    const t = await this.routing.transferTarget(id);
    return t && { facility: { id: t.facility.id, name: t.facility.name, phone: t.facility.phone, freeBeds: t.facility.freeBeds }, km: t.km, clinician: t.clinician && { name: t.clinician.name, specialty: t.clinician.specialty } };
  }

  @Post("visits/:id/transfer")
  @HttpCode(200)
  async transfer(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession) {
    await this.canTransfer(await this.myVisit(id, s));
    const t = await this.routing.transfer(id, s.staffId!);
    return { routingId: t.routing.id, facility: t.facility.name, clinician: t.clinician?.name ?? null };
  }

  /** FR 7.11: on-duty clinicians at this facility who can take over. */
  @Get("visits/:id/colleagues")
  async colleagues(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession) {
    const v = await this.myVisit(id, s);
    const list = await this.routing.clinicians(v.facilityId, v.service);
    return list.filter((c) => c.id !== s.staffId);
  }

  /** FR 7.11: the colleague becomes the attending clinician and is told; this clinician's access ends. */
  @Post("visits/:id/handover")
  @HttpCode(200)
  async handover(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const v = await this.myVisit(id, s);
    const { clinicianId } = parse(handover, body);
    const to = (await this.routing.clinicians(v.facilityId, v.service)).find((c) => c.id === clinicianId && c.id !== s.staffId);
    if (!to) throw new ApiException(400, "VALIDATION", "Choose a colleague on duty at this facility.", { fields: { clinicianId: "Choose a colleague on duty at this facility" } });
    await this.db.client.routing.update({ where: { id }, data: { clinicianId } });
    await this.routing.notify(clinicianId, "HANDOVER", id);
    await this.audit.record({ type: "staff", id: s.staffId }, "patient.handed_over", { routingId: id, from: s.staffId, to: clinicianId }, req.ip);
    return { ok: true, to: to.name };
  }

  /** FR 7.10: Discharged when the patient had a bed (it is freed), Completed when not. Full access ends. */
  @Post("visits/:id/finish")
  @HttpCode(200)
  async finish(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const v = await this.myVisit(id, s);
    const status = v.reservation?.status === "USED" ? "DISCHARGED" : "COMPLETED";
    await this.db.client.routing.update({ where: { id }, data: { status, endedAt: new Date() } });
    await this.audit.record({ type: "staff", id: s.staffId }, status === "DISCHARGED" ? "patient.discharged" : "visit.completed", { routingId: id }, req.ip);
    this.events.emit(`case:${v.caseId}`, { type: "case", caseId: v.caseId });
    return { status };
  }

  // ---------- helpers ----------

  private async isOnDuty(staffId: string) {
    const { date, shift } = currentShift();
    return !!(await this.db.client.shiftAssignment.count({ where: { staffId, date: new Date(`${date}T00:00:00Z`), shift, unavailable: false } }));
  }

  /** FR 7.4: an incoming patient at my facility, and I am on duty. */
  private async incomingHere(id: string, s: LiveSession) {
    const r = await this.db.client.routing.findUnique({
      where: { id },
      include: { case: { include: { patient: true, answers: { where: { answer: true }, orderBy: { createdAt: "asc" } } } }, clinician: true, reservation: true },
    });
    if (!r || r.facilityId !== s.staff!.facilityId || !(INCOMING as readonly string[]).includes(r.status)) {
      throw new ApiException(404, "NOT_FOUND", "This patient isn't on the way to your facility.");
    }
    if (!(await this.isOnDuty(s.staffId!))) throw new ApiException(403, "FORBIDDEN", "Incoming patients are shown to clinicians on duty.");
    return r;
  }

  /** FR 7.6: only the attending clinician, only while the visit is active. */
  private async myVisit(id: string, s: LiveSession) {
    const v = await this.db.client.routing.findUnique({ where: { id }, include: { facility: true, reservation: true } });
    if (!v || v.clinicianId !== s.staffId || v.status !== "ARRIVED") {
      throw new ApiException(403, "FORBIDDEN", "Only the attending clinician can open this, during the visit.");
    }
    return v;
  }

  /** FR 7.9: a transfer is for a patient who needs a bed when none is free here. */
  private async canTransfer(v: Awaited<ReturnType<ClinicianController["myVisit"]>>) {
    if (v.reservation?.status === "USED") throw new ApiException(409, "CONFLICT", "This patient has a bed here.");
    const usage = await bedUsage(this.db.client, v.facilityId);
    if (v.facility.totalBeds - usage.occupied - usage.reserved > 0) throw new ApiException(409, "CONFLICT", "A bed is free here. Assign it instead.");
  }
}

const levelRank = (l: string | null) => (l === "URGENT" ? 0 : l === "UNCERTAIN" ? 1 : 2);

/** FR 7.4: the summary only. No name, ID or contact details before arrival. */
function incomingSummary(r: {
  id: string;
  caseId: string;
  status: string;
  service: string;
  bedNeeded: boolean;
  distanceKm: number | null;
  reason: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  reservation: { status: string } | null;
  case: {
    code: string;
    triageLevel: string | null;
    description: string | null;
    duration: string | null;
    severity: number | null;
    pregnant: boolean | null;
    patient: { sex: string; dateOfBirth: Date; photoUrl: string | null };
    answers: { code: string; textEn: string }[];
  };
}) {
  return {
    id: r.id,
    caseCode: r.case.code,
    status: r.status,
    level: r.case.triageLevel,
    service: r.service,
    bedNeeded: r.bedNeeded,
    bedHeld: r.reservation?.status === "HELD",
    redFlags: r.case.answers.map((a) => ({ code: a.code, text: a.textEn })),
    description: r.case.description,
    duration: r.case.duration,
    severity: r.case.severity,
    pregnant: r.case.pregnant,
    age: ageLabel(r.case.patient.dateOfBirth),
    sex: r.case.patient.sex,
    photoUrl: r.case.patient.photoUrl,
    distanceKm: r.distanceKm,
    transferredFrom: r.reason?.startsWith("Transferred from") ? r.reason : null,
    sentAt: r.createdAt,
    expiresAt: r.expiresAt,
  };
}

function version(e: { id: string; version: number; diagnosis: string | null; treatment: string | null; notes: string | null; createdAt: Date; author: { name: string } }) {
  return { id: e.id, version: e.version, diagnosis: e.diagnosis, treatment: e.treatment, notes: e.notes, by: e.author.name, at: e.createdAt };
}
