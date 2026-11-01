import { Injectable } from "@nestjs/common";
import { formatKm } from "@ubuzima/shared";
import { DbService } from "../common/db.service";
import { CaseFlowService, type CaseDetails } from "./case-flow.service";

type ActiveRouting = NonNullable<Awaited<ReturnType<PatientViewService["activeRouting"]>>>;

type Guidance = {
  facility: { name: string; phone: string | null; distance: string | null } | null;
  noBeds: boolean;
  confirmed: boolean;
  expiresAt: Date | null;
};

/**
 * What the patient's screen shows for a case. The triage level is never shown in words:
 * urgency shows as guidance on where to go.
 */
@Injectable()
export class PatientViewService {
  constructor(
    private db: DbService,
    private flow: CaseFlowService,
  ) {}

  async view(details: CaseDetails) {
    const stage = await this.flow.stage(details);
    const next = stage === "RED_FLAGS" ? await this.flow.nextQuestion(details) : null;
    const inKinyarwanda = next ? await this.openerReadsKinyarwanda(details.openedById) : false;
    const questionText = (question: { textEn: string; textRw: string | null }) =>
      (inKinyarwanda && question.textRw) || question.textEn;

    const routing = await this.activeRouting(details);
    const arrived = routing ? null : await this.lastArrival(details.id);
    const isWaiting = details.status === "QUEUED" || details.status === "OFFERED";
    const noAgentOnline = isWaiting && (await this.noAgentOnline());
    const guidance = await this.guidance(details, routing, arrived !== null, isWaiting, noAgentOnline);
    const messages = await this.db.client.chatMessage.findMany({
      where: { caseId: details.id },
      orderBy: { createdAt: "asc" },
      include: { staff: { select: { name: true } } },
    });

    return {
      id: details.id,
      code: details.code,
      status: details.status,
      stage,
      urgent: details.triageLevel === "URGENT",
      subject: {
        id: details.patient.id,
        firstName: details.patient.firstName,
        name: details.patient.fullName,
      },
      forChild: details.patientId !== details.openedById,
      question: next
        ? {
            id: next.question.id,
            code: next.question.code,
            text: questionText(next.question),
            index: next.index,
            total: next.total,
            after: next.after.map((question) => ({ id: question.id, code: question.code, text: questionText(question) })),
          }
        : null,
      redFlagsAnswered: details.answers.length,
      guidance,
      visit: arrived ? { facility: arrived.facility.name, active: arrived.status === "ARRIVED" } : null,
      noAgent: noAgentOnline,
      delayed: isWaiting && details.escalationLevel >= 2,
      callRequested: details.callRequested,
      outcome: details.outcome,
      rating: details.rating,
      withAgent: details.status === "ASSIGNED",
      messages: messages.map((message) => ({
        id: message.id,
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt,
        staffName: message.staff ? message.staff.name.split(" ")[0] : null,
        audioMs: message.audioMs,
      })),
      createdAt: details.createdAt,
    };
  }

  /**
   * Where the patient should go, or null:
   * 1. Once they have arrived at a facility, the visit replaces any guidance.
   * 2. An Uncertain case nobody can answer (no agent online, or a 5-minute delay) shows the nearest facility.
   * 3. An Urgent case shows its routing at once (or "finding a place" until there is one).
   *    Any other case shows its routing once the agent has confirmed it.
   */
  private async guidance(
    details: CaseDetails,
    routing: ActiveRouting | null,
    arrived: boolean,
    isWaiting: boolean,
    noAgentOnline: boolean,
  ): Promise<Guidance | null> {
    const needsFallback =
      !arrived && !routing && isWaiting && details.triageLevel === "UNCERTAIN" && (noAgentOnline || details.escalationLevel >= 2);
    if (needsFallback) {
      const nearest = await this.flow.nearestFacilityFor(details);
      if (nearest) return { facility: nearest, noBeds: false, confirmed: false, expiresAt: null };
    }

    if (arrived) return null;

    const isUrgent = details.triageLevel === "URGENT";
    const showRouting = routing !== null && (isUrgent || routing.status === "CONFIRMED");
    if (!showRouting && !isUrgent) return null;

    return {
      facility:
        routing && showRouting
          ? {
              name: routing.facility.name,
              phone: routing.facility.phone,
              distance: routing.distanceKm === null ? null : formatKm(routing.distanceKm),
            }
          : null,
      noBeds: routing !== null && routing.bedNeeded && !routing.reservation,
      confirmed: routing?.status === "CONFIRMED",
      expiresAt: routing?.expiresAt ?? null,
    };
  }

  /** The routing the patient is on their way with, unless the case closed some other way than routing them. */
  private async activeRouting(details: CaseDetails) {
    const closedWithoutRouting = details.status === "CLOSED" && details.outcome !== "ROUTED_TO_FACILITY";
    if (closedWithoutRouting) return null;
    return this.db.client.routing.findFirst({
      where: { caseId: details.id, status: { in: ["SUGGESTED", "CONFIRMED"] } },
      include: { facility: true, reservation: true },
    });
  }

  /** The latest facility the patient arrived at. A transfer starts a new routing, which is shown instead. */
  private lastArrival(caseId: string) {
    return this.db.client.routing.findFirst({
      where: { caseId, arrivedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { facility: true },
    });
  }

  private async noAgentOnline() {
    const online = await this.db.client.staff.count({
      where: { role: "AGENT", status: "ACTIVE", agentStatus: { in: ["AVAILABLE", "BUSY"] } },
    });
    return online === 0;
  }

  /** Questions are shown in the language of the patient who opened the case, when a Kinyarwanda text exists. */
  private async openerReadsKinyarwanda(openedById: string) {
    const opener = await this.db.client.patient.findUnique({ where: { id: openedById }, select: { lang: true } });
    return opener?.lang === "rw";
  }
}
