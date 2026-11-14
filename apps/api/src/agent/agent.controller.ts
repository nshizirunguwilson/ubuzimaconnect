import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from "@nestjs/common";
import {
  age,
  ageLabel,
  agentStatusChange,
  callNote,
  chatMessage,
  closeCase,
  prescription,
  routingChoice,
  SERVICES,
  triageReview,
  type Service,
} from "@ubuzima/shared";
import type { Request, Response } from "express";
import { saveVoice, sendVoice } from "../common/voice";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { RoutingService } from "../cases/routing.service";
import { EventsService } from "../live/events.service";
import { PrescriptionsService } from "../prescriptions/prescriptions.service";
import { DispatcherService } from "./dispatcher.service";

const LEVEL1_MS = 2 * 60_000; // FR 6.10: Urgent or Uncertain not accepted within 2 minutes
const CALL_WINDOW_MS = 10 * 60_000; // FR 6.7: 3 unanswered attempts within 10 minutes
const MINOR_SILENCE_MS = 10 * 60_000; // FR 6.9

/** The human agent's work (FR 6). Full case details only while the agent handles that case (FR 9.2). */
@Controller("agent")
@Auth({ kind: "staff", roles: ["AGENT"] })
export class AgentController {
  constructor(
    private db: DbService,
    private events: EventsService,
    private dispatcher: DispatcherService,
    private routing: RoutingService,
    private audit: AuditService,
    private prescriptions: PrescriptionsService,
  ) {}

  /** Status, the case being handled, the current offer, and the waiting counts per level. */
  @Get("state")
  async state(@CurrentSession() s: LiveSession) {
    const me = await this.db.client.staff.findUniqueOrThrow({ where: { id: s.staffId! } });
    const active = await this.db.client.case.findFirst({ where: { agentId: me.id, status: "ASSIGNED" }, select: { id: true, code: true } });
    const offer = await this.db.client.case.findFirst({
      where: { offeredToId: me.id, status: "OFFERED" },
      include: { patient: true, answers: { where: { answer: true } } },
    });
    const waiting = await this.db.client.case.findMany({
      where: { status: { in: ["QUEUED", "OFFERED"] }, triageLevel: { not: null } },
      orderBy: { queuedAt: "asc" },
      include: { patient: true, answers: { where: { answer: true } } },
    });
    const level1 = waiting.some((c) => c.triageLevel !== "MINOR" && c.queuedAt && Date.now() - c.queuedAt.getTime() > LEVEL1_MS);
    return {
      status: me.agentStatus,
      statusSince: me.agentStatusSince,
      active,
      offer: offer && { ...summary(offer), expiresAt: offer.offerExpiresAt },
      waiting: waiting.map(summary),
      // FR 6.12: a Busy agent may pause a Minor or Uncertain case after a level 1 alert.
      level1Alert: level1,
    };
  }

  /** FR 6.1, 6.16: Available, Away or Offline; not Away or Offline while handling a case. */
  @Put("status")
  async setStatus(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const { status } = parse(agentStatusChange, body);
    const active = await this.db.client.case.count({ where: { agentId: s.staffId!, status: "ASSIGNED" } });
    if (active && status !== "AVAILABLE") {
      throw new ApiException(409, "CONFLICT", "Close or release your case first.");
    }
    if (active) return { ok: true }; // stays Busy
    await this.db.client.staff.update({ where: { id: s.staffId! }, data: { agentStatus: status, agentStatusSince: new Date(), lastSeenAt: new Date() } });
    if (status !== "AVAILABLE") {
      await this.db.client.case.updateMany({ where: { offeredToId: s.staffId!, status: "OFFERED" }, data: { status: "QUEUED", offeredToId: null, offerExpiresAt: null } });
    }
    await this.audit.record({ type: "staff", id: s.staffId }, "agent.status", { status }, req.ip);
    this.events.emit("agents", { type: "queue" });
    return { ok: true };
  }

  /** FR 6.3: only one agent can accept; the update only succeeds while the offer is still theirs. */
  @Post("offers/:id/accept")
  @HttpCode(200)
  async accept(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const taken = await this.db.client.case.updateMany({
      where: { id, status: "OFFERED", offeredToId: s.staffId!, offerExpiresAt: { gt: new Date() } },
      data: { status: "ASSIGNED", agentId: s.staffId!, assignedAt: new Date(), offeredToId: null, offerExpiresAt: null, offerSkipped: [], frontOfQueue: false },
    });
    if (taken.count === 0) throw new ApiException(409, "CONFLICT", "This offer has ended.");
    await this.db.client.staff.update({ where: { id: s.staffId! }, data: { agentStatus: "BUSY", agentStatusSince: new Date() } });
    await this.system(id, `${s.staff!.name.split(" ")[0]}, a health agent, is now looking at your request.`);
    await this.audit.record({ type: "staff", id: s.staffId }, "case.accepted", { caseId: id }, req.ip);
    this.events.emit("agents", { type: "queue" });
    return { ok: true };
  }

  @Post("offers/:id/decline")
  @HttpCode(200)
  async decline(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession) {
    const c = await this.db.client.case.findFirst({ where: { id, status: "OFFERED", offeredToId: s.staffId! } });
    if (c) {
      await this.db.client.case.update({ where: { id }, data: { status: "QUEUED", offeredToId: null, offerExpiresAt: null, offerSkipped: { push: s.staffId! } } });
    }
    return { ok: true };
  }

  /** FR 6.5: the full case, identity photo, AI result and reason, and the patient's history. */
  @Get("cases/:id")
  async view(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.mine(id, s);
    const full = await this.db.client.case.findUniqueOrThrow({
      where: { id },
      include: {
        patient: true,
        openedBy: true,
        answers: { orderBy: { createdAt: "asc" } },
        aiResult: true,
        messages: { orderBy: { createdAt: "asc" }, include: { staff: { select: { name: true } } } },
        calls: { orderBy: { createdAt: "asc" }, include: { staff: { select: { name: true } } } },
        changes: { orderBy: { createdAt: "asc" } },
        routings: { orderBy: { createdAt: "desc" }, include: { facility: true, clinician: { select: { id: true, name: true, specialty: true } }, reservation: true } },
      },
    });
    const history = await this.db.client.case.findMany({
      where: { patientId: c.patientId, id: { not: id } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, code: true, createdAt: true, triageLevel: true, category: true, outcome: true, closingNote: true },
    });
    await this.audit.viewed({ type: "staff", id: s.staffId }, "record.viewed", { caseId: id, patientId: c.patientId }, req.ip);
    const a = age(full.patient.dateOfBirth);
    const lastPatient = [...full.messages].reverse().find((m) => m.sender === "PATIENT");
    return {
      id: full.id,
      code: full.code,
      status: full.status,
      patient: {
        id: full.patient.id,
        name: full.patient.fullName,
        sex: full.patient.sex,
        age: a,
        dateOfBirth: full.patient.dateOfBirth,
        district: full.patient.district,
        photoUrl: full.patient.photoUrl,
        openedBy: full.openedById !== full.patientId ? full.openedBy.fullName : null,
      },
      triage: {
        level: full.triageLevel,
        reason: full.triageReason,
        category: full.category,
        neededService: full.neededService,
        bedNeeded: full.bedNeeded,
      },
      pregnant: full.pregnant,
      answers: full.answers.map((x) => ({ code: x.code, text: x.textEn, answer: x.answer })),
      description: full.description,
      duration: full.duration,
      severity: full.severity,
      ai: full.aiResult,
      call: full.callRequested ? { number: full.callNumber, owner: full.callNumberOwner } : null,
      calls: full.calls.map((x) => ({ id: x.id, answered: x.answered, note: x.note, by: x.staff.name, at: x.createdAt })),
      messages: full.messages.map((m) => ({ id: m.id, sender: m.sender, text: m.text, createdAt: m.createdAt, staffName: m.staff?.name ?? null, audioMs: m.audioMs })),
      changes: full.changes,
      routings: full.routings.map((r) => ({
        id: r.id,
        status: r.status,
        facility: { id: r.facility.id, name: r.facility.name, phone: r.facility.phone },
        service: r.service,
        bedNeeded: r.bedNeeded,
        bedHeld: r.reservation?.status === "HELD",
        clinician: r.clinician,
        distanceKm: r.distanceKm,
        expiresAt: r.expiresAt,
      })),
      history,
      // FR 11.6: the patient's full prescription history while the agent handles the case
      prescriptions: await this.prescriptions.forPatient(c.patientId),
      location: { latitude: full.latitude, longitude: full.longitude, source: full.locationSource },
      patientSilentFor: lastPatient ? Date.now() - lastPatient.createdAt.getTime() : null,
    };
  }

  /** FR 6.5: confirm or change level, category, service and bed; every change saved with name and time. */
  @Put("cases/:id/triage")
  async review(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.mine(id, s);
    const next = parse(triageReview, body);
    const fields = [
      ["triageLevel", c.triageLevel, next.triageLevel],
      ["category", c.category, next.category],
      ["neededService", c.neededService, next.neededService],
      ["bedNeeded", c.bedNeeded === null ? null : String(c.bedNeeded), String(next.bedNeeded)],
    ] as const;
    const changed = fields.filter(([, from, to]) => (from ?? null) !== (to ?? null));
    await this.db.client.case.update({ where: { id }, data: next });
    if (changed.length) {
      await this.db.client.caseChange.createMany({
        data: changed.map(([field, from, to]) => ({ caseId: id, staffId: s.staffId!, field, fromValue: from === null ? null : String(from), toValue: to === null ? null : String(to) })),
      });
    }
    await this.audit.record({ type: "staff", id: s.staffId }, "triage.confirmed", { caseId: id, changed: changed.map(([f]) => f) }, req.ip);
    return { ok: true, changed: changed.length };
  }

  /** FR 6.6: a chat message, delivered live to the patient. */
  @Post("cases/:id/messages")
  async message(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession) {
    await this.mine(id, s);
    const { text } = parse(chatMessage, body);
    const m = await this.db.client.chatMessage.create({ data: { caseId: id, sender: "AGENT", staffId: s.staffId!, text } });
    this.events.emit(`case:${id}`, {
      type: "message",
      caseId: id,
      message: { id: m.id, sender: "AGENT", text, createdAt: m.createdAt.toISOString(), staffName: s.staff!.name },
    });
    // Push notifications for patients not in the app come in phase 3 (FR 6.6, NFR 13).
    return { id: m.id };
  }

  /** D74: a voice note from the agent handling the case. */
  @Post("cases/:id/voice")
  async voice(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession) {
    await this.mine(id, s);
    return saveVoice(this.db, this.events, { caseId: id, sender: "AGENT", staffId: s.staffId!, staffName: s.staff!.name }, body);
  }

  /** D74: play a voice note, only while handling the case (FR 9.2). */
  @Get("cases/:id/voice/:messageId")
  async playVoice(@Param("id", ParseUUIDPipe) id: string, @Param("messageId", ParseUUIDPipe) messageId: string, @CurrentSession() s: LiveSession, @Res() res: Response) {
    await this.mine(id, s);
    await sendVoice(this.db, res, id, messageId);
  }

  /**
   * FR 6.7: one call attempt with a note. When the number isn't the patient's own, the date of birth must be
   * confirmed before anything medical. After 3 unanswered attempts in 10 minutes the case closes as No response.
   */
  @Post("cases/:id/calls")
  async call(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.mine(id, s);
    const input = parse(callNote, body);
    if (input.answered && c.callNumberOwner && c.callNumberOwner !== "MINE" && !input.dobConfirmed) {
      throw new ApiException(400, "VALIDATION", "Confirm the patient's date of birth first: the number isn't theirs.", {
        fields: { dobConfirmed: "Confirm the patient's date of birth first" },
      });
    }
    await this.db.client.callNote.create({ data: { caseId: id, staffId: s.staffId!, ...input } });
    await this.audit.record({ type: "staff", id: s.staffId }, "case.call", { caseId: id, answered: input.answered }, req.ip);
    if (!input.answered) {
      const misses = await this.db.client.callNote.count({ where: { caseId: id, answered: false, createdAt: { gte: new Date(Date.now() - CALL_WINDOW_MS) } } });
      if (misses >= 3) {
        await this.system(id, "We tried to call you 3 times without an answer. Tap “Prefer a call” again when you can talk, or call 912 in an emergency.");
        await this.finish(id, s, "NO_RESPONSE", "Closed automatically after 3 unanswered calls within 10 minutes.", req);
        return { closed: true };
      }
    }
    return { closed: false };
  }

  @Get("cases/:id/routing-options")
  async routingOptions(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("service") service: string,
    @Query("bedNeeded") bedNeeded: string,
    @CurrentSession() s: LiveSession,
  ) {
    const c = await this.mine(id, s);
    const svc = (SERVICES as readonly string[]).includes(service) ? (service as Service) : (c.neededService ?? "GENERAL_MEDICINE");
    const opts = await this.routing.options(id, svc, bedNeeded === "true");
    const withClinicians = await Promise.all(
      opts.facilities.slice(0, 8).map(async (f) => ({ ...f, clinicians: await this.routing.clinicians(f.id, svc) })),
    );
    return { ...opts, service: svc, facilities: withClinicians };
  }

  /** FR 5.6, 5.7, 5.10, 5.12: confirm or change the routing. */
  @Post("cases/:id/routing")
  async route(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession) {
    const c = await this.mine(id, s);
    const input = parse(routingChoice, body);
    if (!c.neededService) throw new ApiException(400, "VALIDATION", "Confirm the needed service first.");
    if (c.bedNeeded !== input.bedNeeded) {
      await this.db.client.case.update({ where: { id }, data: { bedNeeded: input.bedNeeded } });
      await this.db.client.caseChange.create({ data: { caseId: id, staffId: s.staffId!, field: "bedNeeded", fromValue: c.bedNeeded === null ? null : String(c.bedNeeded), toValue: String(input.bedNeeded) } });
    }
    const r = await this.routing.route({ caseId: id, service: c.neededService, status: "CONFIRMED", byStaffId: s.staffId!, ...input });
    const f = await this.db.client.facility.findUniqueOrThrow({ where: { id: r.facilityId } });
    await this.system(id, `Go to ${f.name}${f.phone ? ` (${f.phone})` : ""}. They are expecting you for the next 24 hours.`);
    return { id: r.id };
  }

  /** FR 11.1: during the case, no approval needed. */
  @Post("cases/:id/prescriptions")
  async prescribe(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.mine(id, s);
    const { items } = parse(prescription, body);
    const p = await this.prescriptions.issue({ patientId: c.patientId, caseId: id, prescriberId: s.staffId!, items, ip: req.ip });
    await this.system(id, `A prescription was issued: ${p.code}. Show this code at any pharmacy within 7 days. It is also in your records.`);
    return p;
  }

  /** FR 6.16: give the case back; it returns to the front of its queue level. */
  @Post("cases/:id/release")
  @HttpCode(200)
  async release(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    await this.mine(id, s);
    await this.dispatcher.requeue(id, "Another agent will continue with you.");
    await this.freeAgent(s.staffId!);
    await this.audit.record({ type: "staff", id: s.staffId }, "case.released", { caseId: id }, req.ip);
    return { ok: true };
  }

  /** FR 6.12: after a level 1 alert, pause a Minor or Uncertain case to take the urgent one. */
  @Post("cases/:id/pause")
  @HttpCode(200)
  async pause(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.mine(id, s);
    if (c.triageLevel === "URGENT") throw new ApiException(409, "CONFLICT", "An Urgent case can't be paused.");
    const urgentWaiting = await this.db.client.case.findFirst({
      where: { status: { in: ["QUEUED", "OFFERED"] }, triageLevel: { in: ["URGENT", "UNCERTAIN"] }, queuedAt: { lt: new Date(Date.now() - LEVEL1_MS) } },
      orderBy: [{ triageLevel: "asc" }, { queuedAt: "asc" }],
    });
    if (!urgentWaiting) throw new ApiException(409, "CONFLICT", "There is no level 1 alert right now.");
    await this.dispatcher.requeue(id, "Your agent was called to an emergency. Another agent will continue.");
    // Hand the waiting case straight to this agent.
    await this.db.client.case.update({
      where: { id: urgentWaiting.id },
      data: { status: "ASSIGNED", agentId: s.staffId!, assignedAt: new Date(), offeredToId: null, offerExpiresAt: null, frontOfQueue: false },
    });
    await this.system(urgentWaiting.id, `${s.staff!.name.split(" ")[0]}, a health agent, is now looking at your request.`);
    await this.audit.record({ type: "staff", id: s.staffId }, "case.paused", { caseId: id, for: urgentWaiting.id }, req.ip);
    return { next: urgentWaiting.id };
  }

  /** FR 6.15, 6.9: close with one outcome and a note; the agent's access ends; the patient is asked to rate. */
  @Post("cases/:id/close")
  @HttpCode(200)
  async close(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.mine(id, s);
    const { outcome, note } = parse(closeCase, body);
    if (outcome === "NO_RESPONSE") {
      // FR 6.9: only a Minor case, and only after 10 minutes without a reply.
      const last = await this.db.client.chatMessage.findFirst({ where: { caseId: id, sender: "PATIENT" }, orderBy: { createdAt: "desc" } });
      const since = (last?.createdAt ?? c.assignedAt ?? new Date()).getTime();
      if (c.triageLevel !== "MINOR" || Date.now() - since < MINOR_SILENCE_MS) {
        throw new ApiException(409, "CONFLICT", "Only a Minor case with no reply for 10 minutes can close as No response. Urgent and Uncertain cases stay open.");
      }
    }
    if (outcome === "PRESCRIPTION_ISSUED" && !(await this.db.client.prescription.count({ where: { caseId: id, cancelledAt: null } }))) {
      throw new ApiException(409, "CONFLICT", "Issue the prescription before closing as Prescription issued.");
    }
    if (outcome === "ROUTED_TO_FACILITY") {
      const r = await this.db.client.routing.findFirst({ where: { caseId: id, status: "CONFIRMED" } });
      if (!r) throw new ApiException(409, "CONFLICT", "Confirm a routing before closing as Routed to facility.");
    }
    await this.finish(id, s, outcome, note, req);
    return { ok: true };
  }

  // ---------- helpers ----------

  private async mine(id: string, s: LiveSession) {
    const c = await this.db.client.case.findUnique({ where: { id } });
    if (!c || c.agentId !== s.staffId || c.status !== "ASSIGNED") {
      throw new ApiException(403, "FORBIDDEN", "You can only open the case you are handling.");
    }
    return c;
  }

  private async finish(id: string, s: LiveSession, outcome: string, note: string, req: Request) {
    await this.db.client.case.update({
      where: { id },
      data: { status: "CLOSED", outcome: outcome as never, closingNote: note, closedAt: new Date() },
    });
    // A confirmed routing stays valid for the patient's arrival; only an unconfirmed suggestion ends here.
    if (outcome !== "ROUTED_TO_FACILITY") await this.routing.endActive(id, "CANCELLED", "Case closed");
    await this.freeAgent(s.staffId!);
    await this.audit.record({ type: "staff", id: s.staffId }, "case.closed", { caseId: id, outcome }, req.ip);
    this.events.emit(`case:${id}`, { type: "case", caseId: id });
  }

  private async freeAgent(staffId: string) {
    const still = await this.db.client.case.count({ where: { agentId: staffId, status: "ASSIGNED" } });
    if (!still) await this.db.client.staff.update({ where: { id: staffId }, data: { agentStatus: "AVAILABLE", agentStatusSince: new Date() } });
    this.events.emit("agents", { type: "queue" });
  }

  private async system(caseId: string, text: string) {
    const m = await this.db.client.chatMessage.create({ data: { caseId, sender: "SYSTEM", text } });
    this.events.emit(`case:${caseId}`, { type: "message", caseId, message: { id: m.id, sender: "SYSTEM", text, createdAt: m.createdAt.toISOString() } });
    this.events.emit(`case:${caseId}`, { type: "case", caseId });
  }
}

/** What an agent sees before accepting: enough to prioritise, no name (FR 9.2). */
function summary(c: {
  id: string;
  code: string;
  triageLevel: string | null;
  queuedAt: Date | null;
  category: string | null;
  neededService: string | null;
  callRequested: boolean;
  patient: { sex: string; dateOfBirth: Date };
  answers: { code: string }[];
}) {
  return {
    id: c.id,
    code: c.code,
    level: c.triageLevel,
    queuedAt: c.queuedAt,
    category: c.category,
    service: c.neededService,
    callRequested: c.callRequested,
    sex: c.patient.sex,
    age: ageLabel(c.patient.dateOfBirth),
    redFlag: c.answers[0]?.code ?? null,
  };
}
