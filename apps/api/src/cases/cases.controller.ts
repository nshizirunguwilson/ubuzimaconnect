import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import type { Case, Patient } from "@ubuzima/db";
import {
  age,
  asksPregnancy,
  callRequest,
  chatMessage,
  chooseService,
  currentShift,
  formatKm,
  homeCallRequest,
  isNewborn,
  matchFacilities,
  nearestFacilities,
  pregnancyAnswer,
  rating,
  redFlagAnswer,
  redFlagChecklist,
  redFlagGroups,
  sectorByCode,
  SERVICE_LABEL,
  startCase,
  symptoms,
  triageLevel,
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
import { AiService } from "./ai.service";
import { EventsService } from "../live/events.service";
import { FacilityDataService } from "./facilities.service";
import { RoutingService } from "./routing.service";
import { AlertsService } from "../timers/alerts.service";

const OPEN = { not: "CLOSED" as const };
const GROUP_ORDER = { A: 0, C: 1, N: 2, P: 3 } as const;

/**
 * The patient side of a case: start (FR 3.1 to 3.5), red flags one at a time (FR 3.6, 4.1, 4.2),
 * symptoms and AI triage (FR 3.7, 4.3 to 4.9), urgent guidance (FR 5.5), prefer a call (FR 3.8, 3.9)
 * and cancel (FR 3.11). Every case goes to the agent queue whatever its level (FR 4.9).
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
    private audit: AuditService,
  ) {}

  /** The people this patient can open a case for, and any open case each one has (FR 3.1, 3.2). */
  @Get("mine")
  async mine(@CurrentSession() s: LiveSession) {
    const people = await this.people(s);
    const cases = await this.db.client.case.findMany({
      where: { patientId: { in: people.map((p) => p.id) } },
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
      people: people.map((p) => ({
        id: p.id,
        name: p.fullName,
        firstName: p.firstName,
        isSelf: p.id === s.patientId,
      })),
      open: cases.filter((c) => c.status !== "CLOSED"),
      recent: cases.filter((c) => c.status === "CLOSED").slice(0, 5),
    };
  }

  /** FR 3.1 to 3.5: a new case, or the open one if this person already has one (FR 3.2). */
  @Post()
  async start(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const input = parse(startCase, body);
    const subject = await this.subject(s, input.subjectId);
    const open = await this.db.client.case.findFirst({
      where: { patientId: subject.id, status: OPEN },
    });
    if (open) return { id: open.id, existing: true };

    let at: { lat: number; lng: number; sectorCode: string | null };
    if (input.location.source === "GPS") {
      at = {
        lat: input.location.latitude,
        lng: input.location.longitude,
        sectorCode: null,
      };
    } else {
      const sector = sectorByCode(input.location.sectorCode);
      if (!sector)
        throw new ApiException(400, "VALIDATION", "Choose your sector", {
          fields: { sectorCode: "Choose your sector" },
        });
      at = { lat: sector.lat, lng: sector.lng, sectorCode: sector.code };
    }

    const c = await this.create({
      patientId: subject.id,
      openedById: s.patientId!,
      latitude: at.lat,
      longitude: at.lng,
      locationSource: input.location.source,
      sectorCode: at.sectorCode,
    });
    await this.audit.record({ type: "patient", id: s.patientId }, "case.started", { caseId: c.id, forChild: subject.id !== s.patientId }, req.ip);

    // FR 4.2: a baby under 8 days old is Urgent at once, without questions.
    if (isNewborn(age(subject.dateOfBirth))) {
      await this.finishUrgent(c, "PAEDIATRICS", "Baby under 8 days old (rule N2).");
    }

    // FR 3.5: the 5 nearest facilities, for the device to keep.
    const nearby = nearestFacilities(await this.facilities.forMatching(), at).map((f) => ({
      name: f.name,
      distance: formatKm(f.km),
      services: f.services.map((x) => SERVICE_LABEL[x]),
      phone: f.phone,
    }));
    return { id: c.id, existing: false, nearby };
  }

  /** FR 3.8 from the home screen: a case marked "Call requested", Uncertain (FR 4.5 e), straight to the queue. */
  @Post("call")
  async callFromHome(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const input = parse(homeCallRequest, body);
    const subject = await this.subject(s, input.subjectId);
    const open = await this.db.client.case.findFirst({
      where: { patientId: subject.id, status: OPEN },
    });
    if (open) {
      await this.db.client.case.update({
        where: { id: open.id },
        data: {
          callRequested: true,
          callNumber: input.number,
          callNumberOwner: input.owner,
        },
      });
      await this.audit.record({ type: "patient", id: s.patientId }, "case.call.requested", { caseId: open.id }, req.ip);
      return { id: open.id, existing: true };
    }
    const c = await this.create({
      patientId: subject.id,
      openedById: s.patientId!,
      callRequested: true,
      callNumber: input.number,
      callNumberOwner: input.owner,
      triageLevel: "UNCERTAIN",
      triageReason: "Uncertain: patient chose Prefer a call.",
      status: "QUEUED",
      queuedAt: new Date(),
    });
    await this.audit.record({ type: "patient", id: s.patientId }, "case.call.requested", { caseId: c.id }, req.ip);
    return { id: c.id, existing: false };
  }

  @Get(":id")
  async view(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession) {
    const c = await this.own(s, id);
    return this.patientView(c);
  }

  /** "Are you pregnant?" (Appendix C, group P). */
  @Post(":id/pregnancy")
  @HttpCode(200)
  async pregnancy(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession) {
    const c = await this.own(s, id);
    const { pregnant } = parse(pregnancyAnswer, body);
    if (c.triageLevel || c.pregnant !== null || !asksPregnancy(c.patient.sex, age(c.patient.dateOfBirth))) {
      throw new ApiException(409, "CONFLICT", "This question has already been answered.");
    }
    const updated = await this.db.client.case.update({
      where: { id },
      data: { pregnant },
      include: { patient: true, answers: true },
    });
    return this.patientView(updated);
  }

  /** FR 3.6, 4.1: one answer at a time. The first Yes stops the checklist and makes the case Urgent. */
  @Post(":id/answers")
  @HttpCode(200)
  async answer(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(s, id);
    const { questionId, answer } = parse(redFlagAnswer, body);
    const next = await this.nextQuestion(c);
    if (c.triageLevel || !next || next.question.id !== questionId) {
      throw new ApiException(409, "CONFLICT", "This question isn't the next one. Reload the page.");
    }
    await this.db.client.redFlagAnswer.create({
      data: {
        caseId: id,
        questionId,
        code: next.question.code,
        textEn: next.question.textEn,
        answer,
      },
    });
    if (answer) {
      const service = chooseService({
        redFlag: next.question,
        pregnant: c.pregnant,
        years: age(c.patient.dateOfBirth).years,
      });
      await this.finishUrgent(c, service, `Red flag ${next.question.code} answered Yes.`);
      await this.audit.record({ type: "patient", id: s.patientId }, "case.redflag.yes", { caseId: id, code: next.question.code }, req.ip);
    }
    return this.patientView(await this.load(id));
  }

  /**
   * FR 3.6, 4.1: the checklist answered on one screen. A danger sign tapped is a Yes and makes the case Urgent,
   * exactly as the first Yes does one question at a time. "None of these" saves a No for every question shown.
   */
  @Post(":id/checklist")
  @HttpCode(200)
  async checklist(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(s, id);
    const { yes } = parse(redFlagChecklist, body);
    const next = await this.nextQuestion(c);
    if (c.triageLevel || !next) throw new ApiException(409, "CONFLICT", "The danger signs have already been answered. Reload the page.");
    const open = [next.question, ...next.after];
    const tapped = yes ? open.find((q) => q.id === yes) : null;
    if (yes && !tapped) throw new ApiException(400, "VALIDATION", "That danger sign isn't on this list. Reload the page.");
    const answers = tapped ? [{ q: tapped, answer: true }] : open.map((q) => ({ q, answer: false }));
    await this.db.client.redFlagAnswer.createMany({
      data: answers.map(({ q, answer }) => ({ caseId: id, questionId: q.id, code: q.code, textEn: q.textEn, answer })),
    });
    if (tapped) {
      const service = chooseService({ redFlag: tapped, pregnant: c.pregnant, years: age(c.patient.dateOfBirth).years });
      await this.finishUrgent(c, service, `Red flag ${tapped.code} answered Yes.`);
      await this.audit.record({ type: "patient", id: s.patientId }, "case.redflag.yes", { caseId: id, code: tapped.code }, req.ip);
    }
    return this.patientView(await this.load(id));
  }

  /** FR 3.7 then 4.3 to 4.7: the description, then the AI suggestion and the triage rules. */
  @Post(":id/symptoms")
  @HttpCode(200)
  async describe(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(s, id);
    const input = parse(symptoms, body);
    if (c.triageLevel || (await this.stage(c)) !== "SYMPTOMS") {
      throw new ApiException(409, "CONFLICT", "This case isn't waiting for a description. Reload the page.");
    }
    const a = age(c.patient.dateOfBirth);
    const ai = await this.ai.suggest(id, {
      description: input.description,
      duration: input.duration,
      severity: input.severity,
      ageYears: a.years,
      ageMonths: a.months,
      sex: c.patient.sex,
      pregnant: c.pregnant,
      redFlagsAsked: c.answers.length,
    });
    let t = triageLevel(ai, input.description, c.callRequested);
    const category = ai.ok ? ai.category : null;
    const service = chooseService({
      pregnant: c.pregnant,
      years: a.years,
      category,
    });
    // FR 5.9: when no facility can take the case right now, it becomes Urgent so an agent acts on it first.
    const noMatch = t.level !== "URGENT" && (await this.nowhereFor(c, service));
    if (noMatch) {
      t = {
        level: "URGENT",
        reason: `No facility offers ${SERVICE_LABEL[service].toLowerCase()} with a clinician on duty right now`,
      };
      await this.audit.record({ type: "system" }, "routing.no_match", {
        caseId: id,
        service,
        escalated: true,
      });
      await this.alerts.raise("NO_CAPACITY", `${c.code}: ${t.reason.toLowerCase()}.`, { caseId: id });
    }

    await this.db.client.aIResult.create({
      data: ai.ok
        ? {
            caseId: id,
            category: ai.category,
            urgency: ai.urgency,
            confidence: ai.confidence,
            reason: ai.reason,
            latencyMs: ai.latencyMs,
          }
        : { caseId: id, error: ai.error, latencyMs: ai.latencyMs },
    });
    await this.db.client.case.update({
      where: { id },
      data: {
        description: input.description,
        duration: input.duration,
        severity: input.severity,
        category,
        neededService: service,
        triageLevel: t.level,
        triageReason: t.reason,
        status: "QUEUED",
        queuedAt: new Date(),
      },
    });
    await this.audit.record({ type: "patient", id: s.patientId }, "case.submitted", { caseId: id, level: t.level, ai: ai.ok ? "ok" : ai.error }, req.ip);
    if (t.level === "URGENT" && !noMatch) await this.suggest(id, service, false);
    return this.patientView(await this.load(id));
  }

  /** FR 3.8 in the case: ask for a call instead of chat. */
  @Post(":id/call")
  @HttpCode(200)
  async call(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(s, id);
    if (c.status === "CLOSED") throw new ApiException(409, "CONFLICT", "This case is closed.");
    const input = parse(callRequest, body);
    await this.db.client.case.update({
      where: { id },
      data: {
        callRequested: true,
        callNumber: input.number,
        callNumberOwner: input.owner,
      },
    });
    await this.audit.record({ type: "patient", id: s.patientId }, "case.call.requested", { caseId: id }, req.ip);
    return this.patientView(await this.load(id));
  }

  /** FR 3.11: "I no longer need help". The agent is told, and any bed reservation is released. */
  @Post(":id/cancel")
  @HttpCode(200)
  async cancel(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(s, id);
    if (c.status === "CLOSED") throw new ApiException(409, "CONFLICT", "This case is already closed.");
    if (
      await this.db.client.routing.count({
        where: { caseId: id, status: "ARRIVED" },
      })
    ) {
      throw new ApiException(409, "CONFLICT", "You are already being cared for at the facility.");
    }
    await this.db.client.case.update({
      where: { id },
      data: {
        status: "CLOSED",
        outcome: "CANCELLED_BY_PATIENT",
        closingNote: "Cancelled by patient.",
        closedAt: new Date(),
        offeredToId: null,
        offerExpiresAt: null,
      },
    });
    await this.routing.endActive(id, "CANCELLED", "Case cancelled by patient");
    const m = await this.db.client.chatMessage.create({
      data: {
        caseId: id,
        sender: "SYSTEM",
        text: "The patient said they no longer need help. The case is closed.",
      },
    });
    this.events.emit(`case:${id}`, {
      type: "message",
      caseId: id,
      message: {
        id: m.id,
        sender: "SYSTEM",
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      },
    });
    this.events.emit(`case:${id}`, { type: "case", caseId: id });
    if (c.agentId) {
      const still = await this.db.client.case.count({
        where: { agentId: c.agentId, status: "ASSIGNED" },
      });
      if (!still)
        await this.db.client.staff.update({
          where: { id: c.agentId },
          data: { agentStatus: "AVAILABLE", agentStatusSince: new Date() },
        });
    }
    if (c.offeredToId)
      this.events.emit(`agent:${c.offeredToId}`, {
        type: "offer-ended",
        caseId: id,
      });
    this.events.emit("agents", { type: "queue" });
    await this.audit.record({ type: "patient", id: s.patientId }, "case.cancelled", { caseId: id }, req.ip);
    return this.patientView(await this.load(id));
  }

  /** FR 6.6: the patient's side of the chat, while an agent has the case or it waits for one. */
  @Post(":id/messages")
  async message(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession) {
    const c = await this.own(s, id);
    if (c.status === "CLOSED" || !c.triageLevel) throw new ApiException(409, "CONFLICT", "You can't send messages on this case.");
    const { text } = parse(chatMessage, body);
    const m = await this.db.client.chatMessage.create({
      data: { caseId: id, sender: "PATIENT", text },
    });
    this.events.emit(`case:${id}`, {
      type: "message",
      caseId: id,
      message: {
        id: m.id,
        sender: "PATIENT",
        text,
        createdAt: m.createdAt.toISOString(),
      },
    });
    return { id: m.id };
  }

  /** D74: a voice note from the patient, on an open case. */
  @Post(":id/voice")
  async voice(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession) {
    const c = await this.own(s, id);
    if (c.status === "CLOSED" || !c.triageLevel) throw new ApiException(409, "CONFLICT", "You can't send messages on this case.");
    return saveVoice(this.db, this.events, { caseId: id, sender: "PATIENT" }, body);
  }

  /** D74: play a voice note on one of the patient's own cases (open or closed). */
  @Get(":id/voice/:messageId")
  async playVoice(@Param("id", ParseUUIDPipe) id: string, @Param("messageId", ParseUUIDPipe) messageId: string, @CurrentSession() s: LiveSession, @Res() res: Response) {
    await this.own(s, id);
    await sendVoice(this.db, res, id, messageId);
  }

  /** FR 6.15: after closing, the patient rates the help from 1 to 5, once. */
  @Post(":id/rating")
  @HttpCode(200)
  async rate(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const c = await this.own(s, id);
    if (c.status !== "CLOSED" || c.outcome === "CANCELLED_BY_PATIENT" || c.rating !== null) {
      throw new ApiException(409, "CONFLICT", "This case can't be rated.");
    }
    const { rating: value } = parse(rating, body);
    await this.db.client.case.update({
      where: { id },
      data: { rating: value },
    });
    await this.audit.record({ type: "patient", id: s.patientId }, "case.rated", { caseId: id, rating: value }, req.ip);
    return this.patientView(await this.load(id));
  }

  // ---------- helpers ----------

  /** FR 1.3, 3.1: a parent and all their children; a mature child only themselves. */
  private async people(s: LiveSession) {
    const me = s.patient!;
    const links = await this.db.client.familyLink.findMany({
      where: { guardianId: me.id },
      include: { dependant: true },
    });
    return [me, ...links.map((l) => l.dependant)];
  }

  private async subject(s: LiveSession, subjectId: string) {
    const p = (await this.people(s)).find((x) => x.id === subjectId);
    if (!p) throw new ApiException(403, "FORBIDDEN", "You can only ask for help for yourself or your children.");
    return p;
  }

  private load(id: string) {
    return this.db.client.case.findUniqueOrThrow({
      where: { id },
      include: { patient: true, answers: true },
    });
  }

  private async own(s: LiveSession, id: string) {
    const c = await this.db.client.case.findUnique({
      where: { id },
      include: { patient: true, answers: true },
    });
    const ids = (await this.people(s)).map((p) => p.id);
    if (!c || !ids.includes(c.patientId)) throw new ApiException(404, "NOT_FOUND", "This case doesn't exist.");
    return c;
  }

  /** UC-YYYYMMDD-NNNN, numbered per day in Kigali time. Retries if two cases start at once. */
  private async create(data: Omit<Parameters<DbService["client"]["case"]["create"]>[0]["data"], "code">) {
    const day = currentShift().date.replace(/-/g, "");
    for (let attempt = 0; attempt < 5; attempt++) {
      const n =
        (await this.db.client.case.count({
          where: { code: { startsWith: `UC-${day}-` } },
        })) +
        1 +
        attempt;
      try {
        return await this.db.client.case.create({
          data: {
            ...data,
            code: `UC-${day}-${String(n).padStart(4, "0")}`,
          } as never,
        });
      } catch (e) {
        if (!(e as Error).message.includes("Unique constraint")) throw e;
      }
    }
    throw new Error("Could not create a case code");
  }

  /** FR 4.1, 4.2, 5.2: red-flag and newborn cases are Urgent, need a bed, and go to the queue. */
  private async finishUrgent(c: Case, service: Service, reason: string) {
    await this.db.client.case.update({
      where: { id: c.id },
      data: {
        triageLevel: "URGENT",
        triageReason: reason,
        neededService: service,
        bedNeeded: true,
        status: "QUEUED",
        queuedAt: new Date(),
      },
    });
    await this.suggest(c.id, service, true);
  }

  /**
   * FR 5.5, 5.7, 5.12: an Urgent patient is given the nearest suitable facility at once. It is a routing in the
   * Suggested state, with a bed held when one is needed and the clinician assigned automatically; the agent confirms it.
   */
  private async suggest(id: string, service: Service, bedNeeded: boolean) {
    const c = await this.db.client.case.findUniqueOrThrow({ where: { id } });
    if (c.latitude === null || c.longitude === null) return;
    const m = matchFacilities(await this.facilities.forMatching(), { lat: c.latitude, lng: c.longitude }, service, bedNeeded);
    if (m.kind === "NO_MATCH") {
      // FR 5.9: no facility offers the service with that specialty on duty.
      await this.audit.record({ type: "system" }, "routing.no_match", {
        caseId: id,
        service,
      });
      await this.alerts.raise("NO_CAPACITY", `${c.code}: no facility offers ${SERVICE_LABEL[service].toLowerCase()} with a clinician on duty.`, { caseId: id });
      return;
    }
    if (m.kind === "NO_BEDS") {
      await this.audit.record({ type: "system" }, "routing.no_beds", {
        caseId: id,
        service,
      });
      await this.alerts.raise("NO_CAPACITY", `${c.code}: no free bed at any facility offering ${SERVICE_LABEL[service].toLowerCase()}.`, { caseId: id });
    }
    await this.routing.route({
      caseId: id,
      facilityId: m.facility.id,
      service,
      bedNeeded,
      status: "SUGGESTED",
      byStaffId: null,
    });
  }

  /** FR 6.11, 6.13: the nearest facility that can see this case now, shown while no agent can reply. */
  private async nearestFor(c: Case) {
    if (c.latitude === null || c.longitude === null) return null;
    const m = matchFacilities(await this.facilities.forMatching(), { lat: c.latitude, lng: c.longitude }, c.neededService ?? "GENERAL_MEDICINE", false);
    return m.kind === "NO_MATCH"
      ? null
      : {
          name: m.facility.name,
          phone: m.facility.phone,
          distance: formatKm(m.km),
        };
  }

  /** FR 5.9: no active facility offers the service with that specialty on duty (a bed isn't needed here). */
  private async nowhereFor(c: Case, service: Service) {
    if (c.latitude === null || c.longitude === null) return false;
    return matchFacilities(await this.facilities.forMatching(), { lat: c.latitude, lng: c.longitude }, service, false).kind === "NO_MATCH";
  }

  private async questions(c: Case & { patient: Patient }) {
    const groups = redFlagGroups(c.patient.sex, age(c.patient.dateOfBirth), c.pregnant);
    const qs = await this.db.client.redFlagQuestion.findMany({
      where: { active: true, group: { in: groups } },
    });
    return qs.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.sortOrder - b.sortOrder);
  }

  private async nextQuestion(c: Case & { patient: Patient; answers: { questionId: string }[] }) {
    const qs = await this.questions(c);
    const answered = new Set(c.answers.map((a) => a.questionId));
    const i = qs.findIndex((q) => !answered.has(q.id));
    // FR 3.10: the questions after this one travel with it, so the patient can keep answering without a connection.
    return i === -1 ? null : { question: qs[i], index: i + 1, total: qs.length, after: qs.slice(i + 1) };
  }

  private async stage(c: Case & { patient: Patient; answers: { questionId: string }[] }) {
    if (c.status === "CLOSED") return "CLOSED" as const;
    if (c.triageLevel) return "WAITING" as const;
    if (c.pregnant === null && asksPregnancy(c.patient.sex, age(c.patient.dateOfBirth))) return "PREGNANCY" as const;
    return (await this.nextQuestion(c)) ? ("RED_FLAGS" as const) : ("SYMPTOMS" as const);
  }

  /** What the patient sees. The triage level isn't shown in words; urgency shows as guidance (FR 5.5). */
  private async patientView(
    c: Case & {
      patient: Patient;
      answers: { questionId: string; answer: boolean }[];
    },
  ) {
    const stage = await this.stage(c);
    const next = stage === "RED_FLAGS" ? await this.nextQuestion(c) : null;
    const rw = next ? (await this.db.client.patient.findUnique({ where: { id: c.openedById }, select: { lang: true } }))?.lang === "rw" : false;
    // FR 5.5, 5.8, 5.9: an Urgent patient sees the routing at once; others see it once the agent confirms one.
    const r =
      c.status === "CLOSED" && c.outcome !== "ROUTED_TO_FACILITY"
        ? null
        : await this.db.client.routing.findFirst({
            where: { caseId: c.id, status: { in: ["SUGGESTED", "CONFIRMED"] } },
            include: { facility: true, reservation: true },
          });
    // FR 7.5, 7.10: once the patient arrived, the visit replaces the guidance. A transfer starts a new routing, shown instead.
    const arrived = r
      ? null
      : await this.db.client.routing.findFirst({
          where: { caseId: c.id, arrivedAt: { not: null } },
          orderBy: { createdAt: "desc" },
          include: { facility: true },
        });
    const showRouting = r && (c.triageLevel === "URGENT" || r.status === "CONFIRMED");
    // FR 6.13: nobody can answer right now. FR 6.11: an Uncertain case waited more than 5 minutes.
    const waiting = c.status === "QUEUED" || c.status === "OFFERED";
    const noAgent =
      waiting &&
      !(await this.db.client.staff.count({
        where: {
          role: "AGENT",
          status: "ACTIVE",
          agentStatus: { in: ["AVAILABLE", "BUSY"] },
        },
      }));
    const nearestNow = !arrived && !r && waiting && c.triageLevel === "UNCERTAIN" && (noAgent || c.escalationLevel >= 2) ? await this.nearestFor(c) : null;
    const guidance = nearestNow
      ? {
          facility: nearestNow,
          noBeds: false,
          confirmed: false,
          expiresAt: null,
        }
      : arrived
        ? null
        : showRouting || c.triageLevel === "URGENT"
          ? {
              facility:
                r && showRouting
                  ? {
                      name: r.facility.name,
                      phone: r.facility.phone,
                      distance: r.distanceKm === null ? null : formatKm(r.distanceKm),
                    }
                  : null,
              noBeds: !!r && r.bedNeeded && !r.reservation,
              confirmed: r?.status === "CONFIRMED",
              expiresAt: r?.expiresAt ?? null,
            }
          : null;
    const messages = await this.db.client.chatMessage.findMany({
      where: { caseId: c.id },
      orderBy: { createdAt: "asc" },
      include: { staff: { select: { name: true } } },
    });
    return {
      id: c.id,
      code: c.code,
      status: c.status,
      stage,
      urgent: c.triageLevel === "URGENT",
      subject: {
        id: c.patient.id,
        firstName: c.patient.firstName,
        name: c.patient.fullName,
      },
      forChild: c.patientId !== c.openedById,
      question: next
        ? {
            id: next.question.id,
            code: next.question.code,
            // NFR 7: in the language of the patient who opened the case, when a Kinyarwanda text exists.
            text: (rw && next.question.textRw) || next.question.textEn,
            index: next.index,
            total: next.total,
            after: next.after.map((q) => ({ id: q.id, code: q.code, text: (rw && q.textRw) || q.textEn })),
          }
        : null,
      redFlagsAnswered: c.answers.length,
      guidance,
      visit: arrived && {
        facility: arrived.facility.name,
        active: arrived.status === "ARRIVED",
      },
      noAgent,
      delayed: waiting && c.escalationLevel >= 2,
      callRequested: c.callRequested,
      outcome: c.outcome,
      rating: c.rating,
      withAgent: c.status === "ASSIGNED",
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        createdAt: m.createdAt,
        staffName: m.staff ? m.staff.name.split(" ")[0] : null,
        audioMs: m.audioMs,
      })),
      createdAt: c.createdAt,
    };
  }
}
