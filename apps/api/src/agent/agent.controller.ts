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
import { ChatService } from "../live/chat.service";
import { EventsService } from "../live/events.service";
import { PrescriptionsService } from "../prescriptions/prescriptions.service";
import { DispatcherService } from "./dispatcher.service";

/** An Urgent or Uncertain case waiting this long raises a level 1 alert. */
const LEVEL1_MS = 2 * 60_000;
/** 3 unanswered calls within this window close the case as No response. */
const CALL_WINDOW_MS = 10 * 60_000;
const MAX_MISSED_CALLS = 3;
/** A Minor case can close as No response after the patient has been silent this long. */
const MINOR_SILENCE_MS = 10 * 60_000;

/** "Diane Umutoni" becomes "Diane", the name patients see. */
const firstName = (fullName: string) => fullName.split(" ")[0];

/** The health agent's work. An agent sees a case's full details only while they are handling it. */
@Controller("agent")
@Auth({ kind: "staff", roles: ["AGENT"] })
export class AgentController {
  constructor(
    private db: DbService,
    private events: EventsService,
    private chat: ChatService,
    private dispatcher: DispatcherService,
    private routing: RoutingService,
    private audit: AuditService,
    private prescriptions: PrescriptionsService,
  ) {}

  /** The agent's status, the case they are handling, their current offer, and the waiting queue. */
  @Get("state")
  async state(@CurrentSession() session: LiveSession) {
    const me = await this.db.client.staff.findUniqueOrThrow({ where: { id: session.staffId! } });
    const active = await this.db.client.case.findFirst({
      where: { agentId: me.id, status: "ASSIGNED" },
      select: { id: true, code: true },
    });
    const offer = await this.db.client.case.findFirst({
      where: { offeredToId: me.id, status: "OFFERED" },
      include: { patient: true, answers: { where: { answer: true } } },
    });
    const waiting = await this.db.client.case.findMany({
      where: { status: { in: ["QUEUED", "OFFERED"] }, triageLevel: { not: null } },
      orderBy: { queuedAt: "asc" },
      include: { patient: true, answers: { where: { answer: true } } },
    });

    // A Busy agent may pause a Minor or Uncertain case to take an urgent one, once a level 1 alert is up.
    const level1Alert = waiting.some(
      (waitingCase) =>
        waitingCase.triageLevel !== "MINOR" &&
        waitingCase.queuedAt !== null &&
        Date.now() - waitingCase.queuedAt.getTime() > LEVEL1_MS,
    );

    return {
      status: me.agentStatus,
      statusSince: me.agentStatusSince,
      active,
      offer: offer && { ...queueSummary(offer), expiresAt: offer.offerExpiresAt },
      waiting: waiting.map(queueSummary),
      level1Alert,
    };
  }

  /** Available, Away or Offline. An agent handling a case stays Busy until they close or release it. */
  @Put("status")
  async setStatus(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const { status } = parse(agentStatusChange, body);
    const staffId = session.staffId!;

    const handlingCase = (await this.db.client.case.count({ where: { agentId: staffId, status: "ASSIGNED" } })) > 0;
    if (handlingCase && status !== "AVAILABLE") {
      throw new ApiException(409, "CONFLICT", "Close or release your case first.");
    }
    if (handlingCase) return { ok: true }; // stays Busy

    await this.db.client.staff.update({
      where: { id: staffId },
      data: { agentStatus: status, agentStatusSince: new Date(), lastSeenAt: new Date() },
    });
    // Going Away or Offline gives back an offer that is waiting for them.
    if (status !== "AVAILABLE") {
      await this.db.client.case.updateMany({
        where: { offeredToId: staffId, status: "OFFERED" },
        data: { status: "QUEUED", offeredToId: null, offerExpiresAt: null },
      });
    }
    await this.audit.record({ type: "staff", id: staffId }, "agent.status", { status }, request.ip);
    this.events.emit("agents", { type: "queue" });
    return { ok: true };
  }

  /** Accepts an offer. Only one agent can: the update succeeds only while the offer is still theirs and unexpired. */
  @Post("offers/:id/accept")
  @HttpCode(200)
  async accept(
    @Param("id", ParseUUIDPipe) caseId: string,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const staffId = session.staffId!;
    const taken = await this.db.client.case.updateMany({
      where: { id: caseId, status: "OFFERED", offeredToId: staffId, offerExpiresAt: { gt: new Date() } },
      data: {
        status: "ASSIGNED",
        agentId: staffId,
        assignedAt: new Date(),
        offeredToId: null,
        offerExpiresAt: null,
        offerSkipped: [],
        frontOfQueue: false,
      },
    });
    if (taken.count === 0) throw new ApiException(409, "CONFLICT", "This offer has ended.");

    await this.db.client.staff.update({
      where: { id: staffId },
      data: { agentStatus: "BUSY", agentStatusSince: new Date() },
    });
    await this.tellPatient(
      caseId,
      `${firstName(session.staff!.name)}, a health agent, is now looking at your request.`,
    );
    await this.audit.record({ type: "staff", id: staffId }, "case.accepted", { caseId }, request.ip);
    this.events.emit("agents", { type: "queue" });
    return { ok: true };
  }

  /** Lets an offer pass. The case goes back to the queue and remembers that this agent let it pass. */
  @Post("offers/:id/decline")
  @HttpCode(200)
  async decline(@Param("id", ParseUUIDPipe) caseId: string, @CurrentSession() session: LiveSession) {
    const staffId = session.staffId!;
    const offered = await this.db.client.case.findFirst({
      where: { id: caseId, status: "OFFERED", offeredToId: staffId },
    });
    if (offered) {
      await this.db.client.case.update({
        where: { id: caseId },
        data: { status: "QUEUED", offeredToId: null, offerExpiresAt: null, offerSkipped: { push: staffId } },
      });
    }
    return { ok: true };
  }

  /** The full case: identity photo, danger signs, the AI's suggestion and reason, the chat, calls, routings and history. */
  @Get("cases/:id")
  async view(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const handled = await this.mine(id, session);
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
        routings: {
          orderBy: { createdAt: "desc" },
          include: {
            facility: true,
            clinician: { select: { id: true, name: true, specialty: true } },
            reservation: true,
          },
        },
      },
    });
    const history = await this.db.client.case.findMany({
      where: { patientId: handled.patientId, id: { not: id } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        code: true,
        createdAt: true,
        triageLevel: true,
        category: true,
        outcome: true,
        closingNote: true,
      },
    });
    await this.audit.viewed(
      { type: "staff", id: session.staffId },
      "record.viewed",
      { caseId: id, patientId: handled.patientId },
      request.ip,
    );

    const lastPatientMessage = [...full.messages].reverse().find((message) => message.sender === "PATIENT");
    const isForSomeoneElse = full.openedById !== full.patientId;

    return {
      id: full.id,
      code: full.code,
      status: full.status,
      patient: {
        id: full.patient.id,
        name: full.patient.fullName,
        sex: full.patient.sex,
        age: age(full.patient.dateOfBirth),
        dateOfBirth: full.patient.dateOfBirth,
        district: full.patient.district,
        photoUrl: full.patient.photoUrl,
        openedBy: isForSomeoneElse ? full.openedBy.fullName : null,
      },
      triage: {
        level: full.triageLevel,
        reason: full.triageReason,
        category: full.category,
        neededService: full.neededService,
        bedNeeded: full.bedNeeded,
      },
      pregnant: full.pregnant,
      answers: full.answers.map((answer) => ({ code: answer.code, text: answer.textEn, answer: answer.answer })),
      description: full.description,
      duration: full.duration,
      severity: full.severity,
      ai: full.aiResult,
      call: full.callRequested ? { number: full.callNumber, owner: full.callNumberOwner } : null,
      calls: full.calls.map((call) => ({
        id: call.id,
        answered: call.answered,
        note: call.note,
        by: call.staff.name,
        at: call.createdAt,
      })),
      messages: full.messages.map((message) => ({
        id: message.id,
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt,
        staffName: message.staff?.name ?? null,
        audioMs: message.audioMs,
      })),
      changes: full.changes,
      routings: full.routings.map((routing) => ({
        id: routing.id,
        status: routing.status,
        facility: { id: routing.facility.id, name: routing.facility.name, phone: routing.facility.phone },
        service: routing.service,
        bedNeeded: routing.bedNeeded,
        bedHeld: routing.reservation?.status === "HELD",
        clinician: routing.clinician,
        distanceKm: routing.distanceKm,
        expiresAt: routing.expiresAt,
      })),
      history,
      // The patient's full prescription history, while the agent handles the case.
      prescriptions: await this.prescriptions.forPatient(handled.patientId),
      location: { latitude: full.latitude, longitude: full.longitude, source: full.locationSource },
      patientSilentFor: lastPatientMessage ? Date.now() - lastPatientMessage.createdAt.getTime() : null,
    };
  }

  /** Confirms or changes the triage level, category, service and bed. Each change is saved with who made it and when. */
  @Put("cases/:id/triage")
  async review(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const handled = await this.mine(id, session);
    const reviewed = parse(triageReview, body);

    const fields = [
      { field: "triageLevel", from: handled.triageLevel, to: reviewed.triageLevel },
      { field: "category", from: handled.category, to: reviewed.category },
      { field: "neededService", from: handled.neededService, to: reviewed.neededService },
      { field: "bedNeeded", from: textOrNull(handled.bedNeeded), to: String(reviewed.bedNeeded) },
    ];
    const changed = fields.filter(({ from, to }) => (from ?? null) !== (to ?? null));

    await this.db.client.case.update({ where: { id }, data: reviewed });
    if (changed.length > 0) {
      await this.db.client.caseChange.createMany({
        data: changed.map(({ field, from, to }) => ({
          caseId: id,
          staffId: session.staffId!,
          field,
          fromValue: textOrNull(from),
          toValue: textOrNull(to),
        })),
      });
    }
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "triage.confirmed",
      { caseId: id, changed: changed.map(({ field }) => field) },
      request.ip,
    );
    return { ok: true, changed: changed.length };
  }

  /** A chat message to the patient, shown to them at once. */
  @Post("cases/:id/messages")
  async message(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: LiveSession) {
    await this.mine(id, session);
    const { text } = parse(chatMessage, body);
    const message = await this.chat.post(id, "AGENT", text, { id: session.staffId!, name: session.staff!.name });
    return { id: message.id };
  }

  /** A voice note from the agent handling the case. */
  @Post("cases/:id/voice")
  async voice(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: LiveSession) {
    await this.mine(id, session);
    const from = { caseId: id, sender: "AGENT" as const, staffId: session.staffId!, staffName: session.staff!.name };
    return saveVoice(this.db, this.events, from, body);
  }

  /** Plays a voice note, only while the agent is handling the case. */
  @Get("cases/:id/voice/:messageId")
  async playVoice(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("messageId", ParseUUIDPipe) messageId: string,
    @CurrentSession() session: LiveSession,
    @Res() response: Response,
  ) {
    await this.mine(id, session);
    await sendVoice(this.db, response, id, messageId);
  }

  /**
   * One attempt to call the patient, with a note. When the number isn't the patient's own, their date of birth
   * must be confirmed before anything medical is said. After 3 unanswered attempts in 10 minutes the case closes
   * as No response.
   */
  @Post("cases/:id/calls")
  async call(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const handled = await this.mine(id, session);
    const input = parse(callNote, body);

    const numberIsSomeoneElses = handled.callNumberOwner !== null && handled.callNumberOwner !== "MINE";
    if (input.answered && numberIsSomeoneElses && !input.dobConfirmed) {
      throw new ApiException(400, "VALIDATION", "Confirm the patient's date of birth first: the number isn't theirs.", {
        fields: { dobConfirmed: "Confirm the patient's date of birth first" },
      });
    }

    await this.db.client.callNote.create({ data: { caseId: id, staffId: session.staffId!, ...input } });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "case.call",
      { caseId: id, answered: input.answered },
      request.ip,
    );
    if (input.answered) return { closed: false };

    const missedCalls = await this.db.client.callNote.count({
      where: { caseId: id, answered: false, createdAt: { gte: new Date(Date.now() - CALL_WINDOW_MS) } },
    });
    if (missedCalls < MAX_MISSED_CALLS) return { closed: false };

    await this.tellPatient(
      id,
      "We tried to call you 3 times without an answer. Tap “Prefer a call” again when you can talk, or call 912 in an emergency.",
    );
    await this.finish(
      id,
      session,
      "NO_RESPONSE",
      "Closed automatically after 3 unanswered calls within 10 minutes.",
      request,
    );
    return { closed: true };
  }

  /** The facilities the agent can choose from, with the clinicians on duty at the first 8. */
  @Get("cases/:id/routing-options")
  async routingOptions(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("service") requestedService: string,
    @Query("bedNeeded") bedNeeded: string,
    @CurrentSession() session: LiveSession,
  ) {
    const handled = await this.mine(id, session);
    const isKnownService = (SERVICES as readonly string[]).includes(requestedService);
    const service = isKnownService ? (requestedService as Service) : (handled.neededService ?? "GENERAL_MEDICINE");

    const options = await this.routing.options(id, service, bedNeeded === "true");
    const facilities = await Promise.all(
      options.facilities.slice(0, 8).map(async (facility) => ({
        ...facility,
        clinicians: await this.routing.clinicians(facility.id, service),
      })),
    );
    return { ...options, service, facilities };
  }

  /** Confirms or changes where the patient goes, and tells them. */
  @Post("cases/:id/routing")
  async route(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() session: LiveSession) {
    const handled = await this.mine(id, session);
    const input = parse(routingChoice, body);
    if (!handled.neededService) throw new ApiException(400, "VALIDATION", "Confirm the needed service first.");

    if (handled.bedNeeded !== input.bedNeeded) {
      await this.db.client.case.update({ where: { id }, data: { bedNeeded: input.bedNeeded } });
      await this.db.client.caseChange.create({
        data: {
          caseId: id,
          staffId: session.staffId!,
          field: "bedNeeded",
          fromValue: textOrNull(handled.bedNeeded),
          toValue: String(input.bedNeeded),
        },
      });
    }

    const routing = await this.routing.route({
      caseId: id,
      service: handled.neededService,
      status: "CONFIRMED",
      byStaffId: session.staffId!,
      ...input,
    });
    const facility = await this.db.client.facility.findUniqueOrThrow({ where: { id: routing.facilityId } });
    const phone = facility.phone ? ` (${facility.phone})` : "";
    await this.tellPatient(id, `Go to ${facility.name}${phone}. They are expecting you for the next 24 hours.`);
    return { id: routing.id };
  }

  /** Issues a prescription during the case. No approval is needed. */
  @Post("cases/:id/prescriptions")
  async prescribe(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const handled = await this.mine(id, session);
    const { items } = parse(prescription, body);
    const issued = await this.prescriptions.issue({
      patientId: handled.patientId,
      caseId: id,
      prescriberId: session.staffId!,
      items,
      ip: request.ip,
    });
    await this.tellPatient(
      id,
      `A prescription was issued: ${issued.code}. Show this code at any pharmacy within 7 days. It is also in your records.`,
    );
    return issued;
  }

  /** Gives the case back. It returns to the front of its level in the queue. */
  @Post("cases/:id/release")
  @HttpCode(200)
  async release(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    await this.mine(id, session);
    await this.dispatcher.requeue(id, "Another agent will continue with you.");
    await this.freeAgent(session.staffId!);
    await this.audit.record({ type: "staff", id: session.staffId }, "case.released", { caseId: id }, request.ip);
    return { ok: true };
  }

  /** After a level 1 alert, pauses a Minor or Uncertain case so the agent can take the waiting urgent one. */
  @Post("cases/:id/pause")
  @HttpCode(200)
  async pause(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const handled = await this.mine(id, session);
    if (handled.triageLevel === "URGENT") throw new ApiException(409, "CONFLICT", "An Urgent case can't be paused.");

    const urgentWaiting = await this.db.client.case.findFirst({
      where: {
        status: { in: ["QUEUED", "OFFERED"] },
        triageLevel: { in: ["URGENT", "UNCERTAIN"] },
        queuedAt: { lt: new Date(Date.now() - LEVEL1_MS) },
      },
      orderBy: [{ triageLevel: "asc" }, { queuedAt: "asc" }],
    });
    if (!urgentWaiting) throw new ApiException(409, "CONFLICT", "There is no level 1 alert right now.");

    await this.dispatcher.requeue(id, "Your agent was called to an emergency. Another agent will continue.");
    // The waiting case goes straight to this agent, without an offer.
    await this.db.client.case.update({
      where: { id: urgentWaiting.id },
      data: {
        status: "ASSIGNED",
        agentId: session.staffId!,
        assignedAt: new Date(),
        offeredToId: null,
        offerExpiresAt: null,
        frontOfQueue: false,
      },
    });
    await this.tellPatient(
      urgentWaiting.id,
      `${firstName(session.staff!.name)}, a health agent, is now looking at your request.`,
    );
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "case.paused",
      { caseId: id, for: urgentWaiting.id },
      request.ip,
    );
    return { next: urgentWaiting.id };
  }

  /** Closes the case with one outcome and a note. The agent's access ends and the patient is asked to rate. */
  @Post("cases/:id/close")
  @HttpCode(200)
  async close(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const handled = await this.mine(id, session);
    const { outcome, note } = parse(closeCase, body);

    if (outcome === "NO_RESPONSE") await this.checkCanCloseAsNoResponse(handled);

    if (outcome === "PRESCRIPTION_ISSUED") {
      const prescriptions = await this.db.client.prescription.count({ where: { caseId: id, cancelledAt: null } });
      if (prescriptions === 0) {
        throw new ApiException(409, "CONFLICT", "Issue the prescription before closing as Prescription issued.");
      }
    }

    if (outcome === "ROUTED_TO_FACILITY") {
      const confirmed = await this.db.client.routing.findFirst({ where: { caseId: id, status: "CONFIRMED" } });
      if (!confirmed) {
        throw new ApiException(409, "CONFLICT", "Confirm a routing before closing as Routed to facility.");
      }
    }

    await this.finish(id, session, outcome, note, request);
    return { ok: true };
  }

  /** The case this agent is handling. Any other case is refused. */
  private async mine(id: string, session: LiveSession) {
    const found = await this.db.client.case.findUnique({ where: { id } });
    const isTheirs = found && found.agentId === session.staffId && found.status === "ASSIGNED";
    if (!isTheirs) {
      throw new ApiException(403, "FORBIDDEN", "You can only open the case you are handling.");
    }
    return found;
  }

  /** Only a Minor case, and only after 10 minutes without a reply from the patient, can close as No response. */
  private async checkCanCloseAsNoResponse(handled: {
    id: string;
    triageLevel: string | null;
    assignedAt: Date | null;
  }) {
    const lastReply = await this.db.client.chatMessage.findFirst({
      where: { caseId: handled.id, sender: "PATIENT" },
      orderBy: { createdAt: "desc" },
    });
    const silentSince = (lastReply?.createdAt ?? handled.assignedAt ?? new Date()).getTime();
    const silentLongEnough = Date.now() - silentSince >= MINOR_SILENCE_MS;

    if (handled.triageLevel !== "MINOR" || !silentLongEnough) {
      throw new ApiException(
        409,
        "CONFLICT",
        "Only a Minor case with no reply for 10 minutes can close as No response. Urgent and Uncertain cases stay open.",
      );
    }
  }

  private async finish(id: string, session: LiveSession, outcome: string, note: string, request: Request) {
    await this.db.client.case.update({
      where: { id },
      data: { status: "CLOSED", outcome: outcome as never, closingNote: note, closedAt: new Date() },
    });
    // A confirmed routing stays valid for the patient's arrival. Only an unconfirmed suggestion ends here.
    if (outcome !== "ROUTED_TO_FACILITY") {
      await this.routing.endActive(id, "CANCELLED", "Case closed");
    }
    await this.freeAgent(session.staffId!);
    await this.audit.record({ type: "staff", id: session.staffId }, "case.closed", { caseId: id, outcome }, request.ip);
    this.events.emit(`case:${id}`, { type: "case", caseId: id });
  }

  /** The agent becomes Available again once they have no case left. */
  private async freeAgent(staffId: string) {
    const casesLeft = await this.db.client.case.count({ where: { agentId: staffId, status: "ASSIGNED" } });
    if (casesLeft === 0) {
      await this.db.client.staff.update({
        where: { id: staffId },
        data: { agentStatus: "AVAILABLE", agentStatusSince: new Date() },
      });
    }
    this.events.emit("agents", { type: "queue" });
  }

  /** A note from the system in the patient's chat, and a refresh of their screen. */
  private async tellPatient(caseId: string, text: string) {
    await this.chat.post(caseId, "SYSTEM", text);
    this.events.emit(`case:${caseId}`, { type: "case", caseId });
  }
}

/** A value saved as text in the change history, or null. */
function textOrNull(value: string | boolean | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

/** What an agent sees in the queue and in an offer: enough to set priorities, and never the patient's name. */
function queueSummary(c: {
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
