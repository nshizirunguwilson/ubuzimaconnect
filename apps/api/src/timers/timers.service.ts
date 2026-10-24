import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { currentShift } from "@ubuzima/shared";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { RoutingService } from "../cases/routing.service";
import { EventsService } from "../live/events.service";
import { AlertsService } from "./alerts.service";

const MIN = 60_000;
const ROUTING_MS = 24 * 60 * MIN; // FR 5.11
const LEVEL1_MS = 2 * MIN; // FR 6.10
const LEVEL2_MS = 5 * MIN; // FR 6.11
const REPEAT_MS = 2 * MIN; // FR 6.11
const NO_AGENT_MS = 5 * MIN; // FR 6.13
const AI_WINDOW_MS = 5 * MIN; // FR 4.7
const AI_LIMIT = 5;
/** "20:32": times in alerts are Rwanda time, like everywhere else in the app. */
const kigaliTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" }).format(d);
/** Any number, different from the dispatcher's, so only one instance runs the timers at a time. */
const LOCK_KEY = 61_802;

/**
 * The jobs nobody presses a button for. Runs every TIMER_MS (15 s by default):
 * - FR 5.11: routings without an arrival after 24 hours expire, and their bed is released.
 * - FR 5.7: a held bed is released after 6 hours without the patient (the routing itself stays valid).
 * - FR 5.13: patients on the way to a clinician whose shift ended go to a colleague.
 * - FR 6.10, 6.11: Urgent and Uncertain cases not accepted in 2, then 5 minutes, escalate.
 * - FR 6.13: the administrator is told after 5 minutes with no agent online.
 * - FR 4.7: the administrator is told when the AI failed more than 5 times in 5 minutes.
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
    this.timer = setInterval(() => void this.tick(), Number(process.env.TIMER_MS ?? 15_000));
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // The lock is held on one connection for the whole pass; the jobs themselves use ordinary queries.
      await this.db.client.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`;
          if (!locked) return;
          await this.expireRoutings();
          await this.releaseBeds();
          await this.shiftsEnded();
          await this.escalate();
          await this.noAgentOnline();
          await this.aiFailures();
        },
        { timeout: 30_000 },
      );
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  /** FR 5.11: no arrival within 24 hours of the facility being given (confirmed or only suggested). */
  private async expireRoutings() {
    const now = new Date();
    const due = await this.db.client.routing.findMany({
      where: {
        status: { in: ["SUGGESTED", "CONFIRMED"] },
        OR: [{ expiresAt: { lt: now } }, { expiresAt: null, createdAt: { lt: new Date(now.getTime() - ROUTING_MS) } }],
      },
    });
    for (const r of due) {
      await this.db.client.routing.update({ where: { id: r.id }, data: { status: "EXPIRED", endedAt: now } });
      await this.db.client.bedReservation.updateMany({ where: { routingId: r.id, status: "HELD" }, data: { status: "RELEASED", releasedAt: now, releaseReason: "Routing expired" } });
      await this.audit.record({ type: "system" }, "routing.expired", { routingId: r.id, caseId: r.caseId });
      this.events.emit(`facility:${r.facilityId}`, { type: "incoming" });
      this.events.emit(`case:${r.caseId}`, { type: "case", caseId: r.caseId });
    }
  }

  /** FR 5.7: a bed is held for 6 hours; after that it goes back to the free count. */
  private async releaseBeds() {
    const now = new Date();
    const due = await this.db.client.bedReservation.findMany({ where: { status: "HELD", releaseAfter: { lt: now } }, include: { routing: true } });
    for (const b of due) {
      await this.db.client.bedReservation.update({ where: { id: b.id }, data: { status: "RELEASED", releasedAt: now, releaseReason: "Patient didn't arrive within 6 hours" } });
      await this.audit.record({ type: "system" }, "bed.released", { routingId: b.routingId, reason: "6 hours without arrival" });
      this.events.emit(`facility:${b.facilityId}`, { type: "incoming" });
    }
  }

  /** FR 5.13: the attending clinician of a patient on the way is no longer on duty. */
  private async shiftsEnded() {
    const { date, shift } = currentShift();
    const attending = await this.db.client.routing.findMany({
      where: { status: { in: ["SUGGESTED", "CONFIRMED"] }, clinicianId: { not: null } },
      distinct: ["clinicianId"],
      select: { clinicianId: true },
    });
    for (const { clinicianId } of attending) {
      const onDuty = await this.db.client.shiftAssignment.count({ where: { staffId: clinicianId!, date: new Date(`${date}T00:00:00Z`), shift, unavailable: false } });
      if (!onDuty) await this.routing.reassignFrom(clinicianId!, "Shift ended");
    }
  }

  /** FR 6.10, 6.11: measured from when the case started waiting (again). */
  private async escalate() {
    const now = Date.now();
    const waiting = await this.db.client.case.findMany({
      where: { status: { in: ["QUEUED", "OFFERED"] }, triageLevel: { in: ["URGENT", "UNCERTAIN"] }, queuedAt: { lt: new Date(now - LEVEL1_MS) } },
    });
    for (const c of waiting) {
      const waited = now - c.queuedAt!.getTime();
      const minutes = Math.floor(waited / MIN);
      const what = `${c.code} (${c.triageLevel === "URGENT" ? "Urgent" : "Uncertain"}) has waited ${minutes} minutes for an agent.`;
      if (waited >= LEVEL2_MS && c.escalationLevel < 2) {
        await this.setLevel(c.id, 2);
        await this.alerts.raise("DELAY_INCIDENT", what, { caseId: c.id, email: true });
        await this.audit.record({ type: "system" }, "case.delay_incident", { caseId: c.id, minutes });
        this.toAgents(c.id, what);
        // Uncertain patients now see the nearest suitable facility and 912 (FR 6.11).
        this.events.emit(`case:${c.id}`, { type: "case", caseId: c.id });
      } else if (c.escalationLevel === 0) {
        await this.setLevel(c.id, 1);
        await this.alerts.raise("ESCALATION", what, { caseId: c.id });
        await this.audit.record({ type: "system" }, "case.escalated", { caseId: c.id, level: 1 });
        this.toAgents(c.id, what);
      } else if (c.escalationLevel === 2 && c.escalatedAt && now - c.escalatedAt.getTime() >= REPEAT_MS) {
        // FR 6.11: the alerts repeat every 2 minutes until someone accepts.
        await this.setLevel(c.id, 2);
        await this.alerts.raise("DELAY_INCIDENT", `Still waiting: ${what}`, { caseId: c.id });
        this.toAgents(c.id, what);
      }
    }
  }

  /** FR 6.13: tell the administrator once after 5 minutes with nobody online; reset when someone is. */
  private async noAgentOnline() {
    const online = await this.db.client.staff.count({ where: { role: "AGENT", status: "ACTIVE", agentStatus: { in: ["AVAILABLE", "BUSY"] } } });
    const s = await this.db.client.systemSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    if (online > 0) {
      if (s.noAgentSince) await this.db.client.systemSettings.update({ where: { id: 1 }, data: { noAgentSince: null, noAgentAlerted: false } });
      return;
    }
    if (!s.noAgentSince) {
      await this.db.client.systemSettings.update({ where: { id: 1 }, data: { noAgentSince: new Date() } });
      return;
    }
    if (!s.noAgentAlerted && Date.now() - s.noAgentSince.getTime() >= NO_AGENT_MS) {
      await this.db.client.systemSettings.update({ where: { id: 1 }, data: { noAgentAlerted: true } });
      const waiting = await this.db.client.case.count({ where: { status: { in: ["QUEUED", "OFFERED"] } } });
      await this.alerts.raise("NO_AGENT", `No agent has been online since ${kigaliTime(s.noAgentSince)}. ${waiting} ${waiting === 1 ? "case is" : "cases are"} waiting.`, { email: true });
    }
  }

  /** FR 4.7: more than 5 failures in 5 minutes; at most one alert per 5 minutes. */
  private async aiFailures() {
    const since = new Date(Date.now() - AI_WINDOW_MS);
    const failures = await this.db.client.auditEvent.count({ where: { action: "ai.failure", createdAt: { gte: since } } });
    if (failures <= AI_LIMIT) return;
    if (await this.db.client.alert.count({ where: { kind: "AI_FAILURES", createdAt: { gte: since } } })) return;
    await this.alerts.raise("AI_FAILURES", `The AI failed ${failures} times in the last 5 minutes. Cases are going to agents as Uncertain.`, { email: true });
  }

  private setLevel(caseId: string, level: number) {
    return this.db.client.case.update({ where: { id: caseId }, data: { escalationLevel: level, escalatedAt: new Date() } });
  }

  /** FR 6.10: every agent, Busy ones included, on whatever staff page they have open. */
  private toAgents(caseId: string, text: string) {
    this.events.emit("agents", { type: "alert", caseId, text });
  }
}
