import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import {
  age,
  asksPregnancy,
  callRequest,
  chatMessage,
  chooseService,
  formatKm,
  homeCallRequest,
  isNewborn,
  nearestFacilities,
  pregnancyAnswer,
  rating,
  redFlagAnswer,
  redFlagChecklist,
  sectorByCode,
  SERVICE_LABEL,
  startCase,
  symptoms,
  triageLevel,
  type Service,
} from "@ubuzima/shared";
import type { Request, Response } from "express";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { saveVoice, sendVoice } from "../common/voice";
import { parse } from "../common/zod";
import { ChatService } from "../live/chat.service";
import { EventsService } from "../live/events.service";
import { AlertsService } from "../timers/alerts.service";
import { AiService } from "./ai.service";
import { CaseFlowService, type CaseDetails } from "./case-flow.service";
import { FacilityDataService } from "./facilities.service";
import { PatientViewService } from "./patient-view";
import { RoutingService } from "./routing.service";

const NOT_CLOSED = { not: "CLOSED" as const };

/**
 * The patient's side of a request for help: starting it, the danger-sign questions, describing the problem
 * (with the AI's suggestion), asking for a call, chatting, cancelling and rating.
 * Every case goes to the agents' queue, whatever its triage level.
 */
@Controller("cases")
@Auth({ kind: "patient" })
export class CasesController {
  constructor(
    private db: DbService,
    private ai: AiService,
    private facilities: FacilityDataService,
    private routing: RoutingService,
    private alerts: AlertsService,
    private events: EventsService,
    private chat: ChatService,
    private audit: AuditService,
    private flow: CaseFlowService,
    private patientView: PatientViewService,
  ) {}

  /** The people this patient can ask for help for, with their open cases and the last few closed ones. */
  @Get("mine")
  async mine(@CurrentSession() session: LiveSession) {
    const people = await this.flow.people(session);
    const cases = await this.db.client.case.findMany({
      where: { patientId: { in: people.map((person) => person.id) } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        code: true,
        patientId: true,
        status: true,
        triageLevel: true,
        outcome: true,
        createdAt: true,
        closedAt: true,
        callRequested: true,
      },
    });

    return {
      people: people.map((person) => ({
        id: person.id,
        name: person.fullName,
        firstName: person.firstName,
        isSelf: person.id === session.patientId,
      })),
      open: cases.filter((found) => found.status !== "CLOSED"),
      recent: cases.filter((found) => found.status === "CLOSED").slice(0, 5),
    };
  }

  /** Starts a request for help, or returns the open one if this person already has one. */
  @Post()
  async start(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const input = parse(startCase, body);
    const subject = await this.flow.subject(session, input.subjectId);

    const open = await this.db.client.case.findFirst({ where: { patientId: subject.id, status: NOT_CLOSED } });
    if (open) return { id: open.id, existing: true };

    const location = this.resolveLocation(input.location);
    const newCase = await this.flow.create({
      patientId: subject.id,
      openedById: session.patientId!,
      latitude: location.lat,
      longitude: location.lng,
      locationSource: input.location.source,
      sectorCode: location.sectorCode,
    });
    await this.audit.record(
      { type: "patient", id: session.patientId },
      "case.started",
      { caseId: newCase.id, forChild: subject.id !== session.patientId },
      request.ip,
    );

    // A baby under 8 days old is Urgent at once, without any questions.
    if (isNewborn(age(subject.dateOfBirth))) {
      await this.flow.finishUrgent(newCase, "PAEDIATRICS", "Baby under 8 days old (rule N2).");
    }

    // The 5 nearest facilities, for the phone to keep in case the connection drops.
    const nearby = nearestFacilities(await this.facilities.forMatching(), location).map((facility) => ({
      name: facility.name,
      distance: formatKm(facility.km),
      services: facility.services.map((service) => SERVICE_LABEL[service]),
      phone: facility.phone,
    }));
    return { id: newCase.id, existing: false, nearby };
  }

  /**
   * "Prefer a call" from the home screen: a case marked "Call requested", Uncertain, straight to the queue.
   * When the person already has an open case, the call request is added to it.
   */
  @Post("call")
  async callFromHome(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const input = parse(homeCallRequest, body);
    const subject = await this.flow.subject(session, input.subjectId);
    const callDetails = { callRequested: true, callNumber: input.number, callNumberOwner: input.owner };

    const open = await this.db.client.case.findFirst({ where: { patientId: subject.id, status: NOT_CLOSED } });
    if (open) {
      await this.db.client.case.update({ where: { id: open.id }, data: callDetails });
      await this.audit.record({ type: "patient", id: session.patientId }, "case.call.requested", { caseId: open.id }, request.ip);
      return { id: open.id, existing: true };
    }

    const newCase = await this.flow.create({
      patientId: subject.id,
      openedById: session.patientId!,
      ...callDetails,
      triageLevel: "UNCERTAIN",
      triageReason: "Uncertain: patient chose Prefer a call.",
      status: "QUEUED",
      queuedAt: new Date(),
    });
    await this.audit.record({ type: "patient", id: session.patientId }, "case.call.requested", { caseId: newCase.id }, request.ip);
    return { id: newCase.id, existing: false };
  }

  @Get(":id")
  async view(@Param("id", ParseUUIDPipe) caseId: string, @CurrentSession() session: LiveSession) {
    const details = await this.flow.own(session, caseId);
    return this.patientView.view(details);
  }

  /** The answer to "Are you pregnant?", asked before the pregnancy danger signs. */
  @Post(":id/pregnancy")
  @HttpCode(200)
  async pregnancy(@Param("id", ParseUUIDPipe) caseId: string, @Body() body: unknown, @CurrentSession() session: LiveSession) {
    const details = await this.flow.own(session, caseId);
    const { pregnant } = parse(pregnancyAnswer, body);

    const alreadyAnswered = details.triageLevel || details.pregnant !== null;
    const notAsked = !asksPregnancy(details.patient.sex, age(details.patient.dateOfBirth));
    if (alreadyAnswered || notAsked) {
      throw new ApiException(409, "CONFLICT", "This question has already been answered.");
    }

    const updated = await this.db.client.case.update({
      where: { id: caseId },
      data: { pregnant },
      include: { patient: true, answers: true },
    });
    return this.patientView.view(updated);
  }

  /** One danger-sign answer at a time. The first Yes stops the questions and makes the case Urgent. */
  @Post(":id/answers")
  @HttpCode(200)
  async answer(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const details = await this.flow.own(session, caseId);
    const { questionId, answer } = parse(redFlagAnswer, body);

    const next = await this.flow.nextQuestion(details);
    if (details.triageLevel || !next || next.question.id !== questionId) {
      throw new ApiException(409, "CONFLICT", "This question isn't the next one. Reload the page.");
    }

    const question = next.question;
    await this.db.client.redFlagAnswer.create({
      data: { caseId, questionId, code: question.code, textEn: question.textEn, answer },
    });
    if (answer) {
      await this.dangerSignFound(details, question, session, request);
    }
    return this.patientView.view(await this.flow.load(caseId));
  }

  /**
   * The danger-sign checklist answered on one screen. A sign tapped counts as a Yes and makes the case
   * Urgent, exactly like the first Yes one question at a time. "None of these" saves a No for every sign shown.
   */
  @Post(":id/checklist")
  @HttpCode(200)
  async checklist(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const details = await this.flow.own(session, caseId);
    const { yes: tappedId } = parse(redFlagChecklist, body);

    const next = await this.flow.nextQuestion(details);
    if (details.triageLevel || !next) {
      throw new ApiException(409, "CONFLICT", "The danger signs have already been answered. Reload the page.");
    }

    const shown = [next.question, ...next.after];
    const tapped = tappedId ? shown.find((question) => question.id === tappedId) : null;
    if (tappedId && !tapped) {
      throw new ApiException(400, "VALIDATION", "That danger sign isn't on this list. Reload the page.");
    }

    const answers = tapped
      ? [{ question: tapped, answer: true }]
      : shown.map((question) => ({ question, answer: false }));
    await this.db.client.redFlagAnswer.createMany({
      data: answers.map(({ question, answer }) => ({
        caseId,
        questionId: question.id,
        code: question.code,
        textEn: question.textEn,
        answer,
      })),
    });

    if (tapped) {
      await this.dangerSignFound(details, tapped, session, request);
    }
    return this.patientView.view(await this.flow.load(caseId));
  }

  /** The problem in the patient's own words. Then the AI's suggestion, the triage rules, and into the queue. */
  @Post(":id/symptoms")
  @HttpCode(200)
  async describe(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const details = await this.flow.own(session, caseId);
    const input = parse(symptoms, body);
    if (details.triageLevel || (await this.flow.stage(details)) !== "SYMPTOMS") {
      throw new ApiException(409, "CONFLICT", "This case isn't waiting for a description. Reload the page.");
    }

    const patientAge = age(details.patient.dateOfBirth);
    const ai = await this.ai.suggest(caseId, {
      description: input.description,
      duration: input.duration,
      severity: input.severity,
      ageYears: patientAge.years,
      ageMonths: patientAge.months,
      sex: details.patient.sex,
      pregnant: details.pregnant,
      redFlagsAsked: details.answers.length,
    });

    let triage = triageLevel(ai, input.description, details.callRequested);
    const category = ai.ok ? ai.category : null;
    const service = chooseService({ pregnant: details.pregnant, years: patientAge.years, category });

    // When no facility can take the case right now, it becomes Urgent so an agent deals with it first.
    const nowhereToGo = triage.level !== "URGENT" && (await this.flow.nowhereCanTake(details, service));
    if (nowhereToGo) {
      triage = {
        level: "URGENT",
        reason: `No facility offers ${SERVICE_LABEL[service].toLowerCase()} with a clinician on duty right now`,
      };
      await this.audit.record({ type: "system" }, "routing.no_match", { caseId, service, escalated: true });
      await this.alerts.raise("NO_CAPACITY", `${details.code}: ${triage.reason.toLowerCase()}.`, { caseId });
    }

    await this.db.client.aIResult.create({
      data: ai.ok
        ? {
            caseId,
            category: ai.category,
            urgency: ai.urgency,
            confidence: ai.confidence,
            reason: ai.reason,
            latencyMs: ai.latencyMs,
          }
        : { caseId, error: ai.error, latencyMs: ai.latencyMs },
    });
    await this.db.client.case.update({
      where: { id: caseId },
      data: {
        description: input.description,
        duration: input.duration,
        severity: input.severity,
        category,
        neededService: service,
        triageLevel: triage.level,
        triageReason: triage.reason,
        status: "QUEUED",
        queuedAt: new Date(),
      },
    });
    await this.audit.record(
      { type: "patient", id: session.patientId },
      "case.submitted",
      { caseId, level: triage.level, ai: ai.ok ? "ok" : ai.error },
      request.ip,
    );

    if (triage.level === "URGENT" && !nowhereToGo) {
      await this.flow.suggestFacility(caseId, service, false);
    }
    return this.patientView.view(await this.flow.load(caseId));
  }

  /** Asking for a phone call instead of chat, during a request. */
  @Post(":id/call")
  @HttpCode(200)
  async call(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const details = await this.flow.own(session, caseId);
    if (details.status === "CLOSED") throw new ApiException(409, "CONFLICT", "This case is closed.");

    const input = parse(callRequest, body);
    await this.db.client.case.update({
      where: { id: caseId },
      data: { callRequested: true, callNumber: input.number, callNumberOwner: input.owner },
    });
    await this.audit.record({ type: "patient", id: session.patientId }, "case.call.requested", { caseId }, request.ip);
    return this.patientView.view(await this.flow.load(caseId));
  }

  /** "I no longer need help". The agent is told, and any bed held for the patient is released. */
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(@Param("id", ParseUUIDPipe) caseId: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const details = await this.flow.own(session, caseId);
    if (details.status === "CLOSED") throw new ApiException(409, "CONFLICT", "This case is already closed.");

    const alreadyAtFacility = await this.db.client.routing.count({ where: { caseId, status: "ARRIVED" } });
    if (alreadyAtFacility > 0) {
      throw new ApiException(409, "CONFLICT", "You are already being cared for at the facility.");
    }

    await this.db.client.case.update({
      where: { id: caseId },
      data: {
        status: "CLOSED",
        outcome: "CANCELLED_BY_PATIENT",
        closingNote: "Cancelled by patient.",
        closedAt: new Date(),
        offeredToId: null,
        offerExpiresAt: null,
      },
    });
    await this.routing.endActive(caseId, "CANCELLED", "Case cancelled by patient");
    await this.chat.post(caseId, "SYSTEM", "The patient said they no longer need help. The case is closed.");
    this.events.emit(`case:${caseId}`, { type: "case", caseId });

    // The agent becomes Available again when this was their last case.
    if (details.agentId) {
      const casesLeft = await this.db.client.case.count({ where: { agentId: details.agentId, status: "ASSIGNED" } });
      if (casesLeft === 0) {
        await this.db.client.staff.update({
          where: { id: details.agentId },
          data: { agentStatus: "AVAILABLE", agentStatusSince: new Date() },
        });
      }
    }
    if (details.offeredToId) {
      this.events.emit(`agent:${details.offeredToId}`, { type: "offer-ended", caseId });
    }
    this.events.emit("agents", { type: "queue" });

    await this.audit.record({ type: "patient", id: session.patientId }, "case.cancelled", { caseId }, request.ip);
    return this.patientView.view(await this.flow.load(caseId));
  }

  /** The patient's chat message, while the case is waiting for an agent or with one. */
  @Post(":id/messages")
  async message(@Param("id", ParseUUIDPipe) caseId: string, @Body() body: unknown, @CurrentSession() session: LiveSession) {
    const details = await this.flow.own(session, caseId);
    this.ensureChatOpen(details);
    const { text } = parse(chatMessage, body);
    const message = await this.chat.post(caseId, "PATIENT", text);
    return { id: message.id };
  }

  /** A voice note from the patient, on an open case. */
  @Post(":id/voice")
  async voice(@Param("id", ParseUUIDPipe) caseId: string, @Body() body: unknown, @CurrentSession() session: LiveSession) {
    const details = await this.flow.own(session, caseId);
    this.ensureChatOpen(details);
    return saveVoice(this.db, this.events, { caseId, sender: "PATIENT" }, body);
  }

  /** Plays a voice note on one of the patient's own cases, open or closed. */
  @Get(":id/voice/:messageId")
  async playVoice(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Param("messageId", ParseUUIDPipe) messageId: string,
    @CurrentSession() session: LiveSession,
    @Res() response: Response,
  ) {
    await this.flow.own(session, caseId);
    await sendVoice(this.db, response, caseId, messageId);
  }

  /** After the case is closed, the patient rates the help from 1 to 5, once. */
  @Post(":id/rating")
  @HttpCode(200)
  async rate(
    @Param("id", ParseUUIDPipe) caseId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const details = await this.flow.own(session, caseId);
    const canBeRated =
      details.status === "CLOSED" && details.outcome !== "CANCELLED_BY_PATIENT" && details.rating === null;
    if (!canBeRated) throw new ApiException(409, "CONFLICT", "This case can't be rated.");

    const { rating: stars } = parse(rating, body);
    await this.db.client.case.update({ where: { id: caseId }, data: { rating: stars } });
    await this.audit.record({ type: "patient", id: session.patientId }, "case.rated", { caseId, rating: stars }, request.ip);
    return this.patientView.view(await this.flow.load(caseId));
  }

  /** Where the patient is: their GPS position, or the centre of the sector they chose. */
  private resolveLocation(location: ReturnType<typeof startCase.parse>["location"]) {
    if (location.source === "GPS") {
      return { lat: location.latitude, lng: location.longitude, sectorCode: null };
    }
    const sector = sectorByCode(location.sectorCode);
    if (!sector) {
      throw new ApiException(400, "VALIDATION", "Choose your sector", { fields: { sectorCode: "Choose your sector" } });
    }
    return { lat: sector.lat, lng: sector.lng, sectorCode: sector.code };
  }

  /** A danger sign answered Yes: the case becomes Urgent and goes to the service that sign calls for. */
  private async dangerSignFound(
    details: CaseDetails,
    question: { code: string; service: Service },
    session: LiveSession,
    request: Request,
  ) {
    const service = chooseService({
      redFlag: question,
      pregnant: details.pregnant,
      years: age(details.patient.dateOfBirth).years,
    });
    await this.flow.finishUrgent(details, service, `Red flag ${question.code} answered Yes.`);
    await this.audit.record(
      { type: "patient", id: session.patientId },
      "case.redflag.yes",
      { caseId: details.id, code: question.code },
      request.ip,
    );
  }

  /** Messages can be sent once the case is in the queue, and until it is closed. */
  private ensureChatOpen(details: { status: string; triageLevel: string | null }) {
    if (details.status === "CLOSED" || !details.triageLevel) {
      throw new ApiException(409, "CONFLICT", "You can't send messages on this case.");
    }
  }
}
