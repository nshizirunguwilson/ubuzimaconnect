import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from "@nestjs/common";
import { age, ageLabel, arrivalIssue, clinicalEntry, currentShift, handover, prescription } from "@ubuzima/shared";
import type { Request } from "express";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { RoutingService } from "../cases/routing.service";
import { AuditService } from "../common/audit.service";
import { uuid7 } from "../common/crypto";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { EventsService } from "../live/events.service";
import { PrescriptionsService } from "../prescriptions/prescriptions.service";
import { freeBeds } from "../setup/beds";

/** Routings where the patient is still on their way. */
const INCOMING = ["SUGGESTED", "CONFIRMED"] as const;

/** Urgent first, then Uncertain, then Minor. */
function levelRank(level: string | null) {
  if (level === "URGENT") return 0;
  if (level === "UNCERTAIN") return 1;
  return 2;
}

/** What the incoming list needs from a routing. */
const INCOMING_DETAILS = {
  case: {
    include: {
      patient: true,
      answers: { where: { answer: true }, orderBy: { createdAt: "asc" as const } },
    },
  },
  clinician: true,
  reservation: true,
};

/**
 * The clinician's work at a facility. Patients on their way show a summary only, to every on-duty clinician there.
 * The full record is only for the attending clinician, during the active visit.
 * A routing is the visit: "Arrived" means the visit is active.
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
  async patients(@CurrentSession() session: LiveSession) {
    const me = session.staff!;
    const onDuty = await this.isOnDuty(me.id);
    const unread = await this.db.client.notification.findMany({
      where: { staffId: me.id, readAt: null },
      select: { routingId: true, kind: true },
    });

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
            include: INCOMING_DETAILS,
          })
        : [];

    return {
      onDuty,
      visits: visits.map((visit) => ({
        id: visit.id,
        name: visit.case.patient.fullName,
        age: ageLabel(visit.case.patient.dateOfBirth),
        sex: visit.case.patient.sex,
        photoUrl: visit.case.patient.photoUrl,
        level: visit.case.triageLevel,
        service: visit.service,
        arrivedAt: visit.arrivedAt,
        hasBed: visit.reservation?.status === "USED",
        handedOver: unread.some((notice) => notice.routingId === visit.id && notice.kind === "HANDOVER"),
      })),
      // Most urgent first, then in the order they were sent.
      incoming: incoming
        .map((routing) => ({
          ...incomingSummary(routing),
          attending: routing.clinician ? { name: routing.clinician.name, me: routing.clinician.id === me.id } : null,
          isNew: unread.some((notice) => notice.routingId === routing.id),
        }))
        .sort((a, b) => levelRank(a.level) - levelRank(b.level)),
    };
  }

  /** One incoming patient's summary, with the photo to compare when they arrive. */
  @Get("incoming/:id")
  async incomingOne(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession) {
    const routing = await this.incomingHere(routingId, session);
    await this.markNoticesRead(session.staffId!, routingId);
    const issues = await this.db.client.arrivalIssue.findMany({
      where: { routingId },
      orderBy: { createdAt: "asc" },
      include: { clinician: { select: { name: true } } },
    });

    return {
      ...incomingSummary(routing),
      attending: routing.clinician ? { name: routing.clinician.name, me: routing.clinician.id === session.staffId } : null,
      issues: issues.map((issue) => ({ id: issue.id, note: issue.note, by: issue.clinician.name, at: issue.createdAt })),
    };
  }

  /** The person matches their photo. The visit starts, and a held bed becomes the patient's. */
  @Post("incoming/:id/arrive")
  @HttpCode(200)
  async arrive(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const routing = await this.incomingHere(routingId, session);
    const staffId = session.staffId!;
    const attendingId = routing.clinicianId ?? staffId;

    // Only one clinician can mark the arrival: the update only succeeds while the patient is still incoming.
    const marked = await this.db.client.routing.updateMany({
      where: { id: routingId, status: { in: [...INCOMING] } },
      data: { status: "ARRIVED", arrivedAt: new Date(), arrivedById: staffId, clinicianId: attendingId },
    });
    if (marked.count === 0) throw new ApiException(409, "CONFLICT", "This patient was already marked arrived.");

    const bed = await this.db.client.bedReservation.updateMany({
      where: { routingId, status: "HELD" },
      data: { status: "USED" },
    });
    await this.audit.record(
      { type: "staff", id: staffId },
      "patient.arrived",
      { routingId, caseId: routing.caseId, bedUsed: bed.count > 0 },
      request.ip,
    );
    if (!routing.clinicianId) {
      await this.audit.record({ type: "system" }, "routing.clinician_assigned", { routingId, clinicianId: staffId });
    }

    // An urgent patient can arrive before any agent took their case. It leaves the queue: the patient is in care.
    const closed = await this.db.client.case.updateMany({
      where: { id: routing.caseId, status: { in: ["SUBMITTED", "QUEUED", "OFFERED"] } },
      data: {
        status: "CLOSED",
        outcome: "ROUTED_TO_FACILITY",
        closingNote: "Arrived at the facility before an agent took the case.",
        closedAt: new Date(),
        offeredToId: null,
        offerExpiresAt: null,
      },
    });
    if (closed.count > 0) this.events.emit("agents", { type: "queue" });
    this.events.emit(`facility:${routing.facilityId}`, { type: "incoming" });
    this.events.emit(`case:${routing.caseId}`, { type: "case", caseId: routing.caseId });

    return { attending: attendingId === staffId };
  }

  /** The person doesn't match their photo. They stay incoming, and the issue is recorded. */
  @Post("incoming/:id/issue")
  async issue(
    @Param("id", ParseUUIDPipe) routingId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const routing = await this.incomingHere(routingId, session);
    const { note } = parse(arrivalIssue, body);
    const recorded = await this.db.client.arrivalIssue.create({ data: { routingId, clinicianId: session.staffId!, note } });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "arrival.mismatch",
      { routingId, caseId: routing.caseId },
      request.ip,
    );
    return { id: recorded.id };
  }

  /** The full record, from every facility the patient has been to, for the attending clinician during the visit. */
  @Get("visits/:id")
  async visit(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const visit = await this.myVisit(routingId, session);
    await this.markNoticesRead(session.staffId!, routingId);

    const found = await this.db.client.case.findUniqueOrThrow({
      where: { id: visit.caseId },
      include: {
        patient: true,
        answers: { orderBy: { createdAt: "asc" } },
        calls: { orderBy: { createdAt: "asc" }, include: { staff: { select: { name: true } } } },
        agent: { select: { name: true } },
      },
    });
    const entries = await this.db.client.clinicalEntry.findMany({
      where: { patientId: found.patientId },
      orderBy: [{ createdAt: "asc" }],
      include: { author: { select: { name: true } }, routing: { include: { facility: { select: { name: true } } } } },
    });
    const history = await this.db.client.case.findMany({
      where: { patientId: found.patientId, id: { not: found.id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        code: true,
        createdAt: true,
        triageLevel: true,
        outcome: true,
        closingNote: true,
        routings: {
          where: { arrivedAt: { not: null } },
          select: { id: true, status: true, arrivedAt: true, endedAt: true, facility: { select: { name: true } } },
        },
      },
    });
    const bedsFree = await freeBeds(this.db.client, visit.facility);
    await this.audit.viewed(
      { type: "staff", id: session.staffId },
      "record.viewed",
      { routingId, patientId: found.patientId },
      request.ip,
    );

    return {
      id: visit.id,
      status: visit.status,
      facility: { id: visit.facility.id, name: visit.facility.name, freeBeds: bedsFree },
      arrivedAt: visit.arrivedAt,
      service: visit.service,
      bed: visit.reservation?.status === "USED" ? "USED" : "NONE",
      reason: visit.reason,
      patient: {
        id: found.patient.id,
        name: found.patient.fullName,
        sex: found.patient.sex,
        age: age(found.patient.dateOfBirth),
        ageLabel: ageLabel(found.patient.dateOfBirth),
        dateOfBirth: found.patient.dateOfBirth,
        district: found.patient.district,
        photoUrl: found.patient.photoUrl,
      },
      case: {
        id: found.id,
        code: found.code,
        level: found.triageLevel,
        reason: found.triageReason,
        category: found.category,
        pregnant: found.pregnant,
        answers: found.answers.map((answer) => ({ code: answer.code, text: answer.textEn, answer: answer.answer })),
        description: found.description,
        duration: found.duration,
        severity: found.severity,
        agent: found.agent?.name ?? null,
        closingNote: found.closingNote,
        calls: found.calls.map((call) => ({
          id: call.id,
          answered: call.answered,
          note: call.note,
          by: call.staff.name,
          at: call.createdAt,
        })),
      },
      entries: groupEntryVersions(entries, routingId),
      // The full prescription history, during the visit.
      prescriptions: await this.prescriptions.forPatient(found.patientId),
      history: history.map((earlier) => ({
        id: earlier.id,
        code: earlier.code,
        createdAt: earlier.createdAt,
        level: earlier.triageLevel,
        outcome: earlier.outcome,
        closingNote: earlier.closingNote,
        visits: earlier.routings.map((routing) => ({
          id: routing.id,
          facility: routing.facility.name,
          status: routing.status,
          arrivedAt: routing.arrivedAt,
          endedAt: routing.endedAt,
        })),
      })),
    };
  }

  /** A new record entry, saved with its author and the time. */
  @Post("visits/:id/entries")
  async addEntry(
    @Param("id", ParseUUIDPipe) routingId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const visit = await this.myVisit(routingId, session);
    const input = parse(clinicalEntry, body);
    const patientId = await this.patientOf(visit.caseId);

    // The first version of an entry is its own root; later versions point back to it.
    const entryId = uuid7();
    const entry = await this.db.client.clinicalEntry.create({
      data: { id: entryId, rootId: entryId, routingId, patientId, authorId: session.staffId!, ...input },
    });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "record.entry_added",
      { routingId, entryId: entry.id },
      request.ip,
    );
    return { id: entry.id, rootId: entry.rootId };
  }

  /**
   * Updating an entry saves a new version; earlier versions are kept.
   * Only this visit's entries can be updated, and only while the visit is active.
   */
  @Put("visits/:id/entries/:rootId")
  async updateEntry(
    @Param("id", ParseUUIDPipe) routingId: string,
    @Param("rootId", ParseUUIDPipe) rootId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    await this.myVisit(routingId, session);
    const input = parse(clinicalEntry, body);

    const latest = await this.db.client.clinicalEntry.findFirst({
      where: { rootId, routingId },
      orderBy: { version: "desc" },
    });
    if (!latest) throw new ApiException(404, "NOT_FOUND", "This entry isn't part of this visit.");

    // previousVersionId is unique, so two clinicians updating the same version can't both succeed.
    const entry = await this.db.client.clinicalEntry
      .create({
        data: {
          rootId,
          version: latest.version + 1,
          previousVersionId: latest.id,
          routingId,
          patientId: latest.patientId,
          authorId: session.staffId!,
          ...input,
        },
      })
      .catch(() => {
        throw new ApiException(409, "CONFLICT", "Someone saved a newer version. Reload to see it.");
      });

    await this.audit.record(
      { type: "staff", id: session.staffId },
      "record.entry_updated",
      { routingId, entryId: entry.id, version: entry.version },
      request.ip,
    );
    return { id: entry.id, version: entry.version };
  }

  /** A prescription from the attending clinician during the visit. No approval is needed. */
  @Post("visits/:id/prescriptions")
  async prescribe(
    @Param("id", ParseUUIDPipe) routingId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const visit = await this.myVisit(routingId, session);
    const { items } = parse(prescription, body);
    const patientId = await this.patientOf(visit.caseId);
    return this.prescriptions.issue({ patientId, routingId, prescriberId: session.staffId!, items, ip: request.ip });
  }

  /** Gives the patient a free bed when none was held. With none free, the answer is a transfer. */
  @Post("visits/:id/bed")
  @HttpCode(200)
  async assignBed(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const visit = await this.myVisit(routingId, session);
    if (visit.reservation?.status === "USED") throw new ApiException(409, "CONFLICT", "This patient already has a bed.");

    if ((await freeBeds(this.db.client, visit.facility)) <= 0) {
      await this.audit.record(
        { type: "staff", id: session.staffId },
        "bed.none_free",
        { routingId, facilityId: visit.facilityId },
        request.ip,
      );
      throw new ApiException(409, "NO_BED", "No bed is free here. Transfer the patient to a facility with a free bed.");
    }

    const usedBed = {
      status: "USED" as const,
      facilityId: visit.facilityId,
      releaseAfter: new Date(),
      releasedAt: null,
      releaseReason: null,
    };
    await this.db.client.bedReservation.upsert({
      where: { routingId },
      create: { routingId, ...usedBed },
      update: usedBed,
    });
    await this.db.client.routing.update({ where: { id: routingId }, data: { bedNeeded: true } });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "bed.assigned",
      { routingId, facilityId: visit.facilityId },
      request.ip,
    );
    return { ok: true };
  }

  /** Where the patient would be transferred, shown before the clinician confirms. */
  @Get("visits/:id/transfer")
  async transferPreview(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession) {
    await this.checkCanTransfer(await this.myVisit(routingId, session));
    const target = await this.routing.transferTarget(routingId);
    if (!target) return null;

    const { facility, km, clinician } = target;
    return {
      facility: { id: facility.id, name: facility.name, phone: facility.phone, freeBeds: facility.freeBeds },
      km,
      clinician: clinician && { name: clinician.name, specialty: clinician.specialty },
    };
  }

  @Post("visits/:id/transfer")
  @HttpCode(200)
  async transfer(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession) {
    await this.checkCanTransfer(await this.myVisit(routingId, session));
    const transferred = await this.routing.transfer(routingId, session.staffId!);
    return {
      routingId: transferred.routing.id,
      facility: transferred.facility.name,
      clinician: transferred.clinician?.name ?? null,
    };
  }

  /** Colleagues on duty at this facility who can take over the patient. */
  @Get("visits/:id/colleagues")
  async colleagues(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession) {
    const visit = await this.myVisit(routingId, session);
    const onDuty = await this.routing.clinicians(visit.facilityId, visit.service);
    return onDuty.filter((clinician) => clinician.id !== session.staffId);
  }

  /** The colleague becomes the attending clinician and is told. This clinician's access ends. */
  @Post("visits/:id/handover")
  @HttpCode(200)
  async handover(
    @Param("id", ParseUUIDPipe) routingId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const visit = await this.myVisit(routingId, session);
    const { clinicianId } = parse(handover, body);

    const onDuty = await this.routing.clinicians(visit.facilityId, visit.service);
    const colleague = onDuty.find((clinician) => clinician.id === clinicianId && clinician.id !== session.staffId);
    if (!colleague) {
      const message = "Choose a colleague on duty at this facility.";
      throw new ApiException(400, "VALIDATION", message, { fields: { clinicianId: "Choose a colleague on duty at this facility" } });
    }

    await this.db.client.routing.update({ where: { id: routingId }, data: { clinicianId } });
    await this.routing.notify(clinicianId, "HANDOVER", routingId);
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "patient.handed_over",
      { routingId, from: session.staffId, to: clinicianId },
      request.ip,
    );
    return { ok: true, to: colleague.name };
  }

  /** Ends the visit: Discharged when the patient had a bed (which is freed), Completed when not. Full access ends. */
  @Post("visits/:id/finish")
  @HttpCode(200)
  async finish(@Param("id", ParseUUIDPipe) routingId: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const visit = await this.myVisit(routingId, session);
    const hadBed = visit.reservation?.status === "USED";
    const status = hadBed ? "DISCHARGED" : "COMPLETED";

    await this.db.client.routing.update({ where: { id: routingId }, data: { status, endedAt: new Date() } });
    const action = hadBed ? "patient.discharged" : "visit.completed";
    await this.audit.record({ type: "staff", id: session.staffId }, action, { routingId }, request.ip);
    this.events.emit(`case:${visit.caseId}`, { type: "case", caseId: visit.caseId });
    return { status };
  }

  private async isOnDuty(staffId: string) {
    const { date, shift } = currentShift();
    const shifts = await this.db.client.shiftAssignment.count({
      where: { staffId, date: new Date(`${date}T00:00:00Z`), shift, unavailable: false },
    });
    return shifts > 0;
  }

  private markNoticesRead(staffId: string, routingId: string) {
    return this.db.client.notification.updateMany({
      where: { staffId, routingId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  private async patientOf(caseId: string) {
    const found = await this.db.client.case.findUniqueOrThrow({ where: { id: caseId }, select: { patientId: true } });
    return found.patientId;
  }

  /** A patient on their way to my facility. Only clinicians on duty see incoming patients. */
  private async incomingHere(routingId: string, session: LiveSession) {
    const routing = await this.db.client.routing.findUnique({ where: { id: routingId }, include: INCOMING_DETAILS });

    const isIncomingHere =
      routing !== null &&
      routing.facilityId === session.staff!.facilityId &&
      (INCOMING as readonly string[]).includes(routing.status);
    if (!isIncomingHere) {
      throw new ApiException(404, "NOT_FOUND", "This patient isn't on the way to your facility.");
    }

    if (!(await this.isOnDuty(session.staffId!))) {
      throw new ApiException(403, "FORBIDDEN", "Incoming patients are shown to clinicians on duty.");
    }
    return routing;
  }

  /** A visit I am attending that is still active. Anyone else, or a finished visit, is refused. */
  private async myVisit(routingId: string, session: LiveSession) {
    const visit = await this.db.client.routing.findUnique({
      where: { id: routingId },
      include: { facility: true, reservation: true },
    });
    const isMine = visit && visit.clinicianId === session.staffId && visit.status === "ARRIVED";
    if (!isMine) {
      throw new ApiException(403, "FORBIDDEN", "Only the attending clinician can open this, during the visit.");
    }
    return visit;
  }

  /** A transfer is for a patient who needs a bed when none is free here. */
  private async checkCanTransfer(visit: Awaited<ReturnType<ClinicianController["myVisit"]>>) {
    if (visit.reservation?.status === "USED") {
      throw new ApiException(409, "CONFLICT", "This patient has a bed here.");
    }
    if ((await freeBeds(this.db.client, visit.facility)) > 0) {
      throw new ApiException(409, "CONFLICT", "A bed is free here. Assign it instead.");
    }
  }
}

/** What clinicians see before a patient arrives: no name, ID or contact details. */
function incomingSummary(routing: {
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
  const { case: found } = routing;
  return {
    id: routing.id,
    caseCode: found.code,
    status: routing.status,
    level: found.triageLevel,
    service: routing.service,
    bedNeeded: routing.bedNeeded,
    bedHeld: routing.reservation?.status === "HELD",
    redFlags: found.answers.map((answer) => ({ code: answer.code, text: answer.textEn })),
    description: found.description,
    duration: found.duration,
    severity: found.severity,
    pregnant: found.pregnant,
    age: ageLabel(found.patient.dateOfBirth),
    sex: found.patient.sex,
    photoUrl: found.patient.photoUrl,
    distanceKm: routing.distanceKm,
    transferredFrom: routing.reason?.startsWith("Transferred from") ? routing.reason : null,
    sentAt: routing.createdAt,
    expiresAt: routing.expiresAt,
  };
}

type EntryVersion = {
  id: string;
  rootId: string;
  routingId: string;
  version: number;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  createdAt: Date;
  author: { name: string };
  routing: { facility: { name: string } };
};

/**
 * Record entries grouped by their first version (rootId). The latest version is shown,
 * and the earlier ones are kept as its history.
 */
function groupEntryVersions(entries: EntryVersion[], currentRoutingId: string) {
  const versionsByRoot = new Map<string, EntryVersion[]>();
  for (const entry of entries) {
    const versions = versionsByRoot.get(entry.rootId) ?? [];
    versions.push(entry);
    versionsByRoot.set(entry.rootId, versions);
  }

  return [...versionsByRoot.values()].map((versions) => {
    const newestFirst = versions.sort((a, b) => b.version - a.version);
    const [latest, ...earlier] = newestFirst;
    return {
      rootId: latest.rootId,
      thisVisit: latest.routingId === currentRoutingId,
      facility: latest.routing.facility.name,
      latest: versionView(latest),
      earlier: earlier.map(versionView),
    };
  });
}

function versionView(entry: EntryVersion) {
  return {
    id: entry.id,
    version: entry.version,
    diagnosis: entry.diagnosis,
    treatment: entry.treatment,
    notes: entry.notes,
    by: entry.author.name,
    at: entry.createdAt,
  };
}
