import { Injectable } from "@nestjs/common";
import type { Case, Patient } from "@ubuzima/db";
import { age, asksPregnancy, currentShift, formatKm, matchFacilities, redFlagGroups, SERVICE_LABEL, type Service } from "@ubuzima/shared";
import type { LiveSession } from "../auth/session.service";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { AlertsService } from "../timers/alerts.service";
import { FacilityDataService } from "./facilities.service";
import { RoutingService } from "./routing.service";

/** The danger-sign groups are asked in this order: everyone, children, babies, pregnancy. */
const GROUP_ORDER = { A: 0, C: 1, N: 2, P: 3 } as const;
/** How many times to try again when two cases are started at the same moment and get the same code. */
const CODE_ATTEMPTS = 5;

/** A case with its patient and the danger-sign answers given so far. */
export type CaseDetails = Case & { patient: Patient; answers: { questionId: string; answer: boolean }[] };

/** Where the patient is in their request. */
export type Stage = "CLOSED" | "WAITING" | "PREGNANCY" | "RED_FLAGS" | "SYMPTOMS";

type NewCaseData = Omit<Parameters<DbService["client"]["case"]["create"]>[0]["data"], "code">;

/**
 * The steps of a patient's request for help, used by CasesController and PatientViewService:
 * who a case may be for, the danger-sign questions, the case code, and urgent routing.
 */
@Injectable()
export class CaseFlowService {
  constructor(
    private db: DbService,
    private facilities: FacilityDataService,
    private routing: RoutingService,
    private alerts: AlertsService,
    private audit: AuditService,
  ) {}

  // Who a case can be for

  /** A parent and all their children. A child old enough for their own ID card only has themself. */
  async people(session: LiveSession) {
    const me = session.patient!;
    const links = await this.db.client.familyLink.findMany({
      where: { guardianId: me.id },
      include: { dependant: true },
    });
    return [me, ...links.map((link) => link.dependant)];
  }

  /** The person a new case is for. Must be the patient themself or one of their children. */
  async subject(session: LiveSession, subjectId: string) {
    const people = await this.people(session);
    const person = people.find((candidate) => candidate.id === subjectId);
    if (!person) {
      throw new ApiException(403, "FORBIDDEN", "You can only ask for help for yourself or your children.");
    }
    return person;
  }

  // Loading cases

  load(caseId: string): Promise<CaseDetails> {
    return this.db.client.case.findUniqueOrThrow({
      where: { id: caseId },
      include: { patient: true, answers: true },
    });
  }

  /** A case of the patient or one of their children. Anyone else's case is "not found", so its existence isn't revealed. */
  async own(session: LiveSession, caseId: string): Promise<CaseDetails> {
    const found = await this.db.client.case.findUnique({
      where: { id: caseId },
      include: { patient: true, answers: true },
    });
    const allowedPatientIds = (await this.people(session)).map((person) => person.id);
    if (!found || !allowedPatientIds.includes(found.patientId)) {
      throw new ApiException(404, "NOT_FOUND", "This case doesn't exist.");
    }
    return found;
  }

  /**
   * Creates a case with the next code of the day, UC-YYYYMMDD-NNNN, counted per day in Kigali time.
   * When two cases start at once and get the same code, it tries the next number.
   */
  async create(data: NewCaseData) {
    const day = currentShift().date.replace(/-/g, "");

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const casesToday = await this.db.client.case.count({ where: { code: { startsWith: `UC-${day}-` } } });
      const number = casesToday + 1 + attempt;
      const code = `UC-${day}-${String(number).padStart(4, "0")}`;
      try {
        return await this.db.client.case.create({ data: { ...data, code } as never });
      } catch (error) {
        const codeTaken = (error as Error).message.includes("Unique constraint");
        if (!codeTaken) throw error;
      }
    }
    throw new Error("Could not create a case code");
  }

  // Danger-sign questions

  /** The active questions for this patient's age, sex and pregnancy, in the order they are asked. */
  private async questions(details: Case & { patient: Patient }) {
    const groups = redFlagGroups(details.patient.sex, age(details.patient.dateOfBirth), details.pregnant);
    const questions = await this.db.client.redFlagQuestion.findMany({
      where: { active: true, group: { in: groups } },
    });
    return questions.sort((a, b) => {
      const groupDifference = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
      if (groupDifference !== 0) return groupDifference;
      return a.sortOrder - b.sortOrder;
    });
  }

  /**
   * The first question not answered yet, with its position, or null when all are answered.
   * The questions after it come too, so the patient can keep answering without a connection.
   */
  async nextQuestion(details: CaseDetails) {
    const questions = await this.questions(details);
    const answered = new Set(details.answers.map((answer) => answer.questionId));
    const index = questions.findIndex((question) => !answered.has(question.id));
    if (index === -1) return null;

    return {
      question: questions[index],
      index: index + 1,
      total: questions.length,
      after: questions.slice(index + 1),
    };
  }

  async stage(details: CaseDetails): Promise<Stage> {
    if (details.status === "CLOSED") return "CLOSED";
    if (details.triageLevel) return "WAITING";

    const pregnancyNotAskedYet =
      details.pregnant === null && asksPregnancy(details.patient.sex, age(details.patient.dateOfBirth));
    if (pregnancyNotAskedYet) return "PREGNANCY";

    const next = await this.nextQuestion(details);
    return next ? "RED_FLAGS" : "SYMPTOMS";
  }

  // Urgent cases and routing

  /** A danger sign or a newborn makes the case Urgent: it needs a bed and goes straight to the queue. */
  async finishUrgent(urgentCase: Case, service: Service, reason: string) {
    await this.db.client.case.update({
      where: { id: urgentCase.id },
      data: {
        triageLevel: "URGENT",
        triageReason: reason,
        neededService: service,
        bedNeeded: true,
        status: "QUEUED",
        queuedAt: new Date(),
      },
    });
    await this.suggestFacility(urgentCase.id, service, true);
  }

  /**
   * An Urgent patient is given the nearest suitable facility at once, without waiting for an agent.
   * It is a Suggested routing, with a bed held when one is needed and the clinician assigned; the agent confirms it.
   * When no facility can take them, the administrator is alerted.
   */
  async suggestFacility(caseId: string, service: Service, bedNeeded: boolean) {
    const found = await this.db.client.case.findUniqueOrThrow({ where: { id: caseId } });
    if (found.latitude === null || found.longitude === null) return;

    const patientAt = { lat: found.latitude, lng: found.longitude };
    const match = matchFacilities(await this.facilities.forMatching(), patientAt, service, bedNeeded);
    const serviceName = SERVICE_LABEL[service].toLowerCase();

    if (match.kind === "NO_MATCH") {
      await this.audit.record({ type: "system" }, "routing.no_match", { caseId, service });
      await this.alerts.raise("NO_CAPACITY", `${found.code}: no facility offers ${serviceName} with a clinician on duty.`, {
        caseId,
      });
      return;
    }

    if (match.kind === "NO_BEDS") {
      // Still routed to the nearest one, marked as having no free bed.
      await this.audit.record({ type: "system" }, "routing.no_beds", { caseId, service });
      await this.alerts.raise("NO_CAPACITY", `${found.code}: no free bed at any facility offering ${serviceName}.`, {
        caseId,
      });
    }

    await this.routing.route({
      caseId,
      facilityId: match.facility.id,
      service,
      bedNeeded,
      status: "SUGGESTED",
      byStaffId: null,
    });
  }

  /** The nearest facility that can see this case now, shown while no agent can reply. */
  async nearestFacilityFor(found: Case) {
    if (found.latitude === null || found.longitude === null) return null;

    const patientAt = { lat: found.latitude, lng: found.longitude };
    const service = found.neededService ?? "GENERAL_MEDICINE";
    const match = matchFacilities(await this.facilities.forMatching(), patientAt, service, false);
    if (match.kind === "NO_MATCH") return null;

    return { name: match.facility.name, phone: match.facility.phone, distance: formatKm(match.km) };
  }

  /** True when no active facility offers the service with that specialty on duty (a bed doesn't matter here). */
  async nowhereCanTake(found: Case, service: Service) {
    if (found.latitude === null || found.longitude === null) return false;
    const patientAt = { lat: found.latitude, lng: found.longitude };
    const match = matchFacilities(await this.facilities.forMatching(), patientAt, service, false);
    return match.kind === "NO_MATCH";
  }
}
