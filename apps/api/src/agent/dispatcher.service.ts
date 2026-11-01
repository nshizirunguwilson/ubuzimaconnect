import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { TriageLevel } from "@ubuzima/shared";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ChatService } from "../live/chat.service";
import { EventsService } from "../live/events.service";

/** How long an agent has to accept an offer (shorter only in tests). */
const OFFER_MS = Number(process.env.OFFER_MS ?? 30_000);
/** An agent with no live connection for this long counts as gone. */
const LOST_MS = 60_000;
/** Waiting cases are offered in this order of triage level. */
const LEVEL_ORDER: Record<TriageLevel, number> = { URGENT: 0, UNCERTAIN: 1, MINOR: 2 };
/** Any number, as long as every API server uses the same one: only the server holding this lock dispatches. */
const LOCK_KEY = 61_801;

type WaitingCase = { triageLevel: TriageLevel | null; frontOfQueue: boolean; queuedAt: Date | null };

/** Urgent first, then Uncertain, then Minor. Within a level, cases put back at the front first, then the oldest. */
function byQueueOrder(a: WaitingCase, b: WaitingCase) {
  const levelDifference = LEVEL_ORDER[a.triageLevel!] - LEVEL_ORDER[b.triageLevel!];
  if (levelDifference !== 0) return levelDifference;

  if (a.frontOfQueue !== b.frontOfQueue) return a.frontOfQueue ? -1 : 1;

  return (a.queuedAt?.getTime() ?? 0) - (b.queuedAt?.getTime() ?? 0);
}

/**
 * Hands waiting cases to agents. Runs every few seconds (DISPATCH_MS, 2000 by default):
 * 1. Agents with no live connection for 60 seconds become Offline, and their case goes back to the front.
 * 2. Offers not accepted within 30 seconds go back to the queue, to be offered to someone else.
 * 3. Waiting cases are offered in queue order, each to the Available agent who has been free the longest.
 *    An agent has one case at a time.
 * Escalations and the other timers run in TimersService.
 */
@Injectable()
export class DispatcherService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Dispatcher");
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private db: DbService,
    private events: EventsService,
    private chat: ChatService,
    private audit: AuditService,
  ) {}

  onModuleInit() {
    const every = Number(process.env.DISPATCH_MS ?? 2000);
    this.timer = setInterval(() => void this.tick(), every);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return; // the last run hasn't finished yet
    this.running = true;
    try {
      await this.db.client.$transaction(
        async (transaction) => {
          // The lock is released when the transaction ends, even if this server crashes.
          const [{ locked }] = await transaction.$queryRaw<{ locked: boolean }[]>`
            select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`;
          if (!locked) return; // another server is dispatching

          await this.markLostAgentsOffline();
          await this.returnExpiredOffers();
          await this.offerWaitingCases();
        },
        { timeout: 15_000 },
      );
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  /**
   * Puts a case back at the front of its level, with an optional message for the patient.
   * Used when an agent pauses or releases a case, and when their connection is lost.
   */
  async requeue(caseId: string, patientMessage: string | null) {
    await this.db.client.case.update({
      where: { id: caseId },
      data: {
        status: "QUEUED",
        agentId: null,
        offeredToId: null,
        offerExpiresAt: null,
        assignedAt: null,
        frontOfQueue: true,
        // The wait starts again now, so the escalation clock does too.
        queuedAt: new Date(),
        escalationLevel: 0,
        escalatedAt: null,
      },
    });

    if (patientMessage) {
      await this.chat.post(caseId, "SYSTEM", patientMessage);
    }
    this.events.emit(`case:${caseId}`, { type: "case", caseId });
    this.events.emit("agents", { type: "queue" });
  }

  /** Agents not seen for 60 seconds go Offline. Their active case is requeued and their offer withdrawn. */
  private async markLostAgentsOffline() {
    const cutoff = new Date(Date.now() - LOST_MS);
    const lostAgents = await this.db.client.staff.findMany({
      where: {
        role: "AGENT",
        agentStatus: { not: "OFFLINE" },
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
      },
      select: { id: true },
    });

    for (const agent of lostAgents) {
      await this.db.client.staff.update({
        where: { id: agent.id },
        data: { agentStatus: "OFFLINE", agentStatusSince: new Date() },
      });

      const activeCases = await this.db.client.case.findMany({
        where: { agentId: agent.id, status: "ASSIGNED" },
        select: { id: true },
      });
      for (const activeCase of activeCases) {
        await this.requeue(activeCase.id, "Another agent will continue with you.");
      }

      await this.db.client.case.updateMany({
        where: { offeredToId: agent.id, status: "OFFERED" },
        data: { status: "QUEUED", offeredToId: null, offerExpiresAt: null },
      });
      await this.audit.record({ type: "system" }, "agent.lost_connection", {
        staffId: agent.id,
        casesReturned: activeCases.length,
      });
    }
  }

  /** Offers nobody accepted in time go back to the queue, remembering who let them pass. */
  private async returnExpiredOffers() {
    const expired = await this.db.client.case.findMany({
      where: { status: "OFFERED", offerExpiresAt: { lt: new Date() } },
    });

    for (const expiredCase of expired) {
      const agentId = expiredCase.offeredToId;
      await this.db.client.case.update({
        where: { id: expiredCase.id },
        data: {
          status: "QUEUED",
          offeredToId: null,
          offerExpiresAt: null,
          offerSkipped: agentId ? { push: agentId } : undefined,
        },
      });
      if (agentId) {
        this.events.emit(`agent:${agentId}`, { type: "offer-ended", caseId: expiredCase.id });
      }
    }
  }

  private async offerWaitingCases() {
    const freeAgents = await this.freeAgents();
    if (freeAgents.length === 0) return;

    const waiting = await this.db.client.case.findMany({ where: { status: "QUEUED", triageLevel: { not: null } } });
    waiting.sort(byQueueOrder);

    for (const waitingCase of waiting) {
      if (freeAgents.length === 0) break;

      // Prefer an agent who hasn't let this case pass yet. When everyone has, start the round again
      // with the first agent, rather than leave the case unoffered.
      const skippedBy = waitingCase.offerSkipped;
      const preferredIndex = freeAgents.findIndex((agent) => !skippedBy.includes(agent.id));
      const everyoneHasSkipped = preferredIndex === -1;
      const [agent] = freeAgents.splice(everyoneHasSkipped ? 0 : preferredIndex, 1);

      const expiresAt = new Date(Date.now() + OFFER_MS);
      await this.db.client.case.update({
        where: { id: waitingCase.id },
        data: {
          status: "OFFERED",
          offeredToId: agent.id,
          offerExpiresAt: expiresAt,
          offerSkipped: everyoneHasSkipped ? [] : undefined,
        },
      });
      this.events.emit(`agent:${agent.id}`, { type: "offer", caseId: waitingCase.id, expiresAt: expiresAt.toISOString() });
    }

    this.events.emit("agents", { type: "queue" });
  }

  /**
   * Available agents with a live connection and no case, the one free the longest first.
   * An agent with an active case, or with an offer waiting, isn't free.
   */
  private async freeAgents() {
    const connectedSince = new Date(Date.now() - LOST_MS);

    const casesInHand = await this.db.client.case.findMany({
      where: { OR: [{ status: "ASSIGNED" }, { status: "OFFERED" }] },
      select: { agentId: true, offeredToId: true },
    });
    const agentsWithCase = new Set<string>();
    for (const busyCase of casesInHand) {
      if (busyCase.agentId) agentsWithCase.add(busyCase.agentId);
      if (busyCase.offeredToId) agentsWithCase.add(busyCase.offeredToId);
    }

    const available = await this.db.client.staff.findMany({
      where: { role: "AGENT", status: "ACTIVE", agentStatus: "AVAILABLE", lastSeenAt: { gte: connectedSince } },
      orderBy: { agentStatusSince: "asc" },
      select: { id: true },
    });
    return available.filter((agent) => !agentsWithCase.has(agent.id));
  }
}
