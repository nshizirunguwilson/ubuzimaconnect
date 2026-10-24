import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { TriageLevel } from "@ubuzima/shared";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { EventsService } from "../live/events.service";

const OFFER_MS = Number(process.env.OFFER_MS ?? 30_000); // FR 6.3 (shorter only in tests)
const LOST_MS = 60_000; // FR 6.14
const LEVEL_ORDER: Record<TriageLevel, number> = { URGENT: 0, UNCERTAIN: 1, MINOR: 2 };
/** Any number; the same on every instance, so only one instance dispatches at a time. */
const LOCK_KEY = 61_801;

/**
 * Runs every few seconds (DISPATCH_MS, default 2000):
 * 1. Agents with no live connection for 60 s become Offline; their case goes back to the front (FR 6.14).
 * 2. Offers not accepted in 30 s go to the next Available agent (FR 6.3).
 * 3. Waiting cases are offered: Urgent, then Uncertain, then Minor, oldest first (FR 6.2), each to the
 *    Available agent free the longest, one active case per agent (FR 6.3, 6.4).
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
    if (this.running) return;
    this.running = true;
    try {
      await this.db.client.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`;
          if (!locked) return;
          await this.lostAgents();
          await this.expiredOffers();
          await this.offer();
        },
        { timeout: 15_000 },
      );
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running = false;
    }
  }

  /** Puts a case back at the front of its level with a message for the patient. Used by pause, release and lost connection. */
  async requeue(caseId: string, patientMessage: string | null) {
    await this.db.client.case.update({
      where: { id: caseId },
      // Waiting starts again now, so the escalation clock does too (FR 6.10).
      data: { status: "QUEUED", agentId: null, offeredToId: null, offerExpiresAt: null, assignedAt: null, frontOfQueue: true, queuedAt: new Date(), escalationLevel: 0, escalatedAt: null },
    });
    if (patientMessage) {
      const m = await this.db.client.chatMessage.create({ data: { caseId, sender: "SYSTEM", text: patientMessage } });
      this.events.emit(`case:${caseId}`, { type: "message", caseId, message: { id: m.id, sender: "SYSTEM", text: m.text, createdAt: m.createdAt.toISOString() } });
    }
    this.events.emit(`case:${caseId}`, { type: "case", caseId });
    this.events.emit("agents", { type: "queue" });
  }

  private async lostAgents() {
    const cutoff = new Date(Date.now() - LOST_MS);
    const lost = await this.db.client.staff.findMany({
      where: { role: "AGENT", agentStatus: { not: "OFFLINE" }, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }] },
      select: { id: true },
    });
    for (const a of lost) {
      await this.db.client.staff.update({ where: { id: a.id }, data: { agentStatus: "OFFLINE", agentStatusSince: new Date() } });
      const active = await this.db.client.case.findMany({ where: { agentId: a.id, status: "ASSIGNED" }, select: { id: true } });
      for (const c of active) await this.requeue(c.id, "Another agent will continue with you.");
      await this.db.client.case.updateMany({ where: { offeredToId: a.id, status: "OFFERED" }, data: { status: "QUEUED", offeredToId: null, offerExpiresAt: null } });
      await this.audit.record({ type: "system" }, "agent.lost_connection", { staffId: a.id, casesReturned: active.length });
    }
  }

  private async expiredOffers() {
    const expired = await this.db.client.case.findMany({ where: { status: "OFFERED", offerExpiresAt: { lt: new Date() } } });
    for (const c of expired) {
      await this.db.client.case.update({
        where: { id: c.id },
        data: { status: "QUEUED", offeredToId: null, offerExpiresAt: null, offerSkipped: c.offeredToId ? { push: c.offeredToId } : undefined },
      });
      if (c.offeredToId) this.events.emit(`agent:${c.offeredToId}`, { type: "offer-ended", caseId: c.id });
    }
  }

  private async offer() {
    const fresh = new Date(Date.now() - LOST_MS);
    const busy = await this.db.client.case.findMany({
      where: { OR: [{ status: "ASSIGNED" }, { status: "OFFERED" }] },
      select: { agentId: true, offeredToId: true },
    });
    const taken = new Set(busy.flatMap((b) => [b.agentId, b.offeredToId]).filter(Boolean) as string[]);
    const agents = (
      await this.db.client.staff.findMany({
        where: { role: "AGENT", status: "ACTIVE", agentStatus: "AVAILABLE", lastSeenAt: { gte: fresh } },
        orderBy: { agentStatusSince: "asc" }, // free the longest first
        select: { id: true },
      })
    ).filter((a) => !taken.has(a.id));
    if (agents.length === 0) return;

    const waiting = (await this.db.client.case.findMany({ where: { status: "QUEUED", triageLevel: { not: null } } })).sort(
      (a, b) =>
        LEVEL_ORDER[a.triageLevel!] - LEVEL_ORDER[b.triageLevel!] ||
        Number(b.frontOfQueue) - Number(a.frontOfQueue) ||
        (a.queuedAt?.getTime() ?? 0) - (b.queuedAt?.getTime() ?? 0),
    );

    for (const c of waiting) {
      if (agents.length === 0) break;
      let i = agents.findIndex((a) => !c.offerSkipped.includes(a.id));
      // Everyone has let it pass once: start the round again rather than leave it unoffered.
      if (i === -1) i = 0;
      const agent = agents.splice(i, 1)[0];
      const expiresAt = new Date(Date.now() + OFFER_MS);
      await this.db.client.case.update({
        where: { id: c.id },
        data: { status: "OFFERED", offeredToId: agent.id, offerExpiresAt: expiresAt, offerSkipped: i === 0 && c.offerSkipped.includes(agent.id) ? [] : undefined },
      });
      this.events.emit(`agent:${agent.id}`, { type: "offer", caseId: c.id, expiresAt: expiresAt.toISOString() });
    }
    this.events.emit("agents", { type: "queue" });
  }
}
