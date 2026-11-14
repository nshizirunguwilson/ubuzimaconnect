import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { currentShift } from "@ubuzima/shared";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { RoutingService } from "../cases/routing.service";
import { EventsService } from "../live/events.service";
import { AlertsService } from "./alerts.service";

const MINUTE = 60_000;
/** A routing with no arrival after this long expires. */
const ROUTING_LIFETIME_MS = 24 * 60 * MINUTE;
/** An Urgent or Uncertain case waiting this long raises the first alert... */
const FIRST_ESCALATION_MS = 2 * MINUTE;
/** ...and this long, a delay incident, emailed to the administrator. */
const DELAY_INCIDENT_MS = 5 * MINUTE;
/** After a delay incident, the alert repeats this often until an agent accepts. */
const REPEAT_ALERT_MS = 2 * MINUTE;
/** The administrator is told when no agent has been online for this long. */
const NO_AGENT_ALERT_MS = 5 * MINUTE;
/** The administrator is told when the AI fails more than AI_FAILURE_LIMIT times in this window. */
const AI_FAILURE_WINDOW_MS = 5 * MINUTE;
const AI_FAILURE_LIMIT = 5;
/** Any number different from the dispatcher's, so only one server runs the timers at a time. */
const LOCK_KEY = 61_802;

/** "20:32" in Rwanda time, like every time shown in the app. */
function kigaliTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" }).format(
    date,
  );
}

/**
 * The jobs nobody presses a button for. Runs every TIMER_MS (10 seconds by default):
 * - routings with no arrival after 24 hours expire, and their bed is released
 * - a held bed is released after 6 hours without the patient (the routing itself stays valid)
 * - patients on their way to a clinician whose shift has ended go to a colleague
 * - Urgent and Uncertain cases not accepted in 2, then 5 minutes, raise alerts
 * - the administrator is told after 5 minutes with no agent online
 * - the administrator is told when the AI has failed more than 5 times in 5 minutes
 */
@Injectable()
export class TimersService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Timers");
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private db: DbService,
    private events: EventsService,
    private audit: AuditService,
    private routing: RoutingService,
    private alerts: AlertsService,
  ) {}

  onModuleInit() {
    const every = Number(process.env.TIMER_MS ?? 10_000);
    this.timer = setInterval(() => void this.tick(), every);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return; // the last run hasn't finished yet
    this.running = true;
    try {
      // The lock is held on one connection for the whole run; the jobs themselves use ordinary queries.
      await this.db.client.$transaction(
        async (transaction) => {
          const [{ locked }] = await transaction.$queryRaw<{ locked: boolean }[]>`
            select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`;
          if (!locked) return; // another server is running the timers

          await this.expireRoutings();
          await this.releaseHeldBeds();
          await this.reassignPatientsOfEndedShifts();
          await this.escalateWaitingCases();
          await this.alertWhenNoAgentOnline();
          await this.alertOnAiFailures();
        },
        { timeout: 30_000 },
      );
    } catch (error) {
      this.log.error(error);
    } finally {
      this.running = false;
    }
  }

  /** No arrival within 24 hours of the facility being given, whether confirmed or only suggested. */
  private async expireRoutings() {
    const now = new Date();
    const createdBefore = new Date(now.getTime() - ROUTING_LIFETIME_MS);
    const due = await this.db.client.routing.findMany({
      where: {
        status: { in: ["SUGGESTED", "CONFIRMED"] },
        OR: [{ expiresAt: { lt: now } }, { expiresAt: null, createdAt: { lt: createdBefore } }],
      },
    });

    for (const routing of due) {
      await this.db.client.routing.update({ where: { id: routing.id }, data: { status: "EXPIRED", endedAt: now } });
      await this.db.client.bedReservation.updateMany({
        where: { routingId: routing.id, status: "HELD" },
        data: { status: "RELEASED", releasedAt: now, releaseReason: "Routing expired" },
      });
      await this.audit.record({ type: "system" }, "routing.expired", { routingId: routing.id, caseId: routing.caseId });
      this.events.emit(`facility:${routing.facilityId}`, { type: "incoming" });
      this.events.emit(`case:${routing.caseId}`, { type: "case", caseId: routing.caseId });
    }
  }

  /** A bed is held for 6 hours. After that it goes back to the free count. */
  private async releaseHeldBeds() {
    const now = new Date();
    const due = await this.db.client.bedReservation.findMany({
      where: { status: "HELD", releaseAfter: { lt: now } },
      include: { routing: true },
    });

    for (const bed of due) {
      await this.db.client.bedReservation.update({
        where: { id: bed.id },
        data: { status: "RELEASED", releasedAt: now, releaseReason: "Patient didn't arrive within 6 hours" },
      });
      await this.audit.record({ type: "system" }, "bed.released", {
        routingId: bed.routingId,
        reason: "6 hours without arrival",
      });
      this.events.emit(`facility:${bed.facilityId}`, { type: "incoming" });
    }
  }

  /** A patient on their way to a clinician who is no longer on duty is given to a colleague. */
  private async reassignPatientsOfEndedShifts() {
    const { date, shift } = currentShift();
    const attending = await this.db.client.routing.findMany({
      where: { status: { in: ["SUGGESTED", "CONFIRMED"] }, clinicianId: { not: null } },
      distinct: ["clinicianId"],
      select: { clinicianId: true },
    });

    for (const { clinicianId } of attending) {
      const onDuty = await this.db.client.shiftAssignment.count({
        where: { staffId: clinicianId!, date: new Date(`${date}T00:00:00Z`), shift, unavailable: false },
      });
      if (onDuty === 0) {
        await this.routing.reassignFrom(clinicianId!, "Shift ended");
      }
    }
  }

  /**
   * Urgent and Uncertain cases nobody has accepted. The wait is measured from when the case started
   * waiting, or started waiting again after being put back in the queue.
   * Level 1 after 2 minutes: agents and the administrator are alerted.
   * Level 2 after 5 minutes: a delay incident, also emailed, repeated every 2 minutes until someone accepts.
   */
  private async escalateWaitingCases() {
    const now = Date.now();
    const waiting = await this.db.client.case.findMany({
      where: {
        status: { in: ["QUEUED", "OFFERED"] },
        triageLevel: { in: ["URGENT", "UNCERTAIN"] },
        queuedAt: { lt: new Date(now - FIRST_ESCALATION_MS) },
      },
    });

    for (const waitingCase of waiting) {
      const waitedMs = now - waitingCase.queuedAt!.getTime();
      const minutes = Math.floor(waitedMs / MINUTE);
      const level = waitingCase.triageLevel === "URGENT" ? "Urgent" : "Uncertain";
      const description = `${waitingCase.code} (${level}) has waited ${minutes} minutes for an agent.`;

      const becomesDelayIncident = waitedMs >= DELAY_INCIDENT_MS && waitingCase.escalationLevel < 2;
      const becomesLevelOne = !becomesDelayIncident && waitingCase.escalationLevel === 0;
      const sinceLastAlert = waitingCase.escalatedAt ? now - waitingCase.escalatedAt.getTime() : 0;
      const alertIsDueAgain =
        !becomesDelayIncident &&
        waitingCase.escalationLevel === 2 &&
        waitingCase.escalatedAt !== null &&
        sinceLastAlert >= REPEAT_ALERT_MS;

      if (becomesDelayIncident) {
        await this.setEscalationLevel(waitingCase.id, 2);
        await this.alerts.raise("DELAY_INCIDENT", description, { caseId: waitingCase.id, email: true });
        await this.audit.record({ type: "system" }, "case.delay_incident", { caseId: waitingCase.id, minutes });
        this.alertAgents(waitingCase.id, description);
        // An Uncertain patient now sees the nearest suitable facility and the 912 number.
        this.events.emit(`case:${waitingCase.id}`, { type: "case", caseId: waitingCase.id });
      } else if (becomesLevelOne) {
        await this.setEscalationLevel(waitingCase.id, 1);
        await this.alerts.raise("ESCALATION", description, { caseId: waitingCase.id });
        await this.audit.record({ type: "system" }, "case.escalated", { caseId: waitingCase.id, level: 1 });
        this.alertAgents(waitingCase.id, description);
      } else if (alertIsDueAgain) {
        await this.setEscalationLevel(waitingCase.id, 2); // restarts the 2-minute repeat clock
        await this.alerts.repeat("DELAY_INCIDENT", `Still waiting: ${description}`, waitingCase.id);
        this.alertAgents(waitingCase.id, description);
      }
    }
  }

  /** Tells the administrator once after 5 minutes with nobody online, and starts again when someone is. */
  private async alertWhenNoAgentOnline() {
    const agentsOnline = await this.db.client.staff.count({
      where: { role: "AGENT", status: "ACTIVE", agentStatus: { in: ["AVAILABLE", "BUSY"] } },
    });
    const settings = await this.db.client.systemSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

    if (agentsOnline > 0) {
      if (settings.noAgentSince) {
        await this.db.client.systemSettings.update({
          where: { id: 1 },
          data: { noAgentSince: null, noAgentAlerted: false },
        });
      }
      return;
    }

    if (!settings.noAgentSince) {
      await this.db.client.systemSettings.update({ where: { id: 1 }, data: { noAgentSince: new Date() } });
      return;
    }

    const longEnough = Date.now() - settings.noAgentSince.getTime() >= NO_AGENT_ALERT_MS;
    if (settings.noAgentAlerted || !longEnough) return;

    await this.db.client.systemSettings.update({ where: { id: 1 }, data: { noAgentAlerted: true } });
    const waiting = await this.db.client.case.count({ where: { status: { in: ["QUEUED", "OFFERED"] } } });
    const casesWaiting = waiting === 1 ? "1 case is" : `${waiting} cases are`;
    // Always shown in the app (FR 6.13); emailed only when someone is waiting, so an empty night sends no email.
    // A case that arrives later is still emailed through its own 5-minute delay alert (FR 6.11).
    await this.alerts.raise(
      "NO_AGENT",
      `No agent has been online since ${kigaliTime(settings.noAgentSince)}. ${casesWaiting} waiting.`,
      { email: waiting > 0 },
    );
  }

  /** More than 5 AI failures in 5 minutes. At most one alert every 5 minutes. */
  private async alertOnAiFailures() {
    const since = new Date(Date.now() - AI_FAILURE_WINDOW_MS);
    const failures = await this.db.client.auditEvent.count({
      where: { action: "ai.failure", createdAt: { gte: since } },
    });
    if (failures <= AI_FAILURE_LIMIT) return;

    const alreadyAlerted = await this.db.client.alert.count({
      where: { kind: "AI_FAILURES", createdAt: { gte: since } },
    });
    if (alreadyAlerted > 0) return;

    await this.alerts.raise(
      "AI_FAILURES",
      `The AI failed ${failures} times in the last 5 minutes. Cases are going to agents as Uncertain.`,
      { email: true },
    );
  }

  private setEscalationLevel(caseId: string, level: number) {
    return this.db.client.case.update({
      where: { id: caseId },
      data: { escalationLevel: level, escalatedAt: new Date() },
    });
  }

  /** Every agent sees the alert, Busy ones included, on whatever staff page they have open. */
  private alertAgents(caseId: string, text: string) {
    this.events.emit("agents", { type: "alert", caseId, text });
  }
}
