import { Injectable } from "@nestjs/common";
import { DbService } from "./db.service";

/** Views by the same person of the same record within this time count as one. */
const VIEW_WINDOW_MS = 10 * 60_000;

export type Actor = { type: "patient" | "staff" | "anonymous" | "system"; id?: string | null };

/**
 * NFR 9: an append-only record of security and care events. Never stores secrets or national IDs.
 * Each event is linked to the patient whose record it touched (FR 10.2), found here in one place:
 * the patient named in the detail, else the case's or routing's patient, else a patient acting for themselves.
 */
@Injectable()
export class AuditService {
  constructor(private db: DbService) {}

  async record(actor: Actor, action: string, detail?: Record<string, unknown>, ip?: string) {
    return this.db.client.auditEvent.create({
      data: { actorType: actor.type, actorId: actor.id ?? null, action, detail: detail as object | undefined, ip, patientId: await this.patientOf(actor, detail) },
    });
  }

  /**
   * FR 10.1: opening a record is logged once per sitting. A screen that refreshes after every chat message
   * would otherwise list the same person many times in the patient's activity (FR 10.2).
   */
  async viewed(actor: Actor, action: "record.viewed" | "records.viewed", detail: Record<string, unknown>, ip?: string) {
    const patientId = await this.patientOf(actor, detail);
    const recent = await this.db.client.auditEvent.count({
      where: { action, actorType: actor.type, actorId: actor.id ?? null, patientId, createdAt: { gte: new Date(Date.now() - VIEW_WINDOW_MS) } },
    });
    if (!recent) await this.record(actor, action, detail, ip);
  }

  private async patientOf(actor: Actor, detail?: Record<string, unknown>) {
    const id = (k: string) => (typeof detail?.[k] === "string" ? (detail[k] as string) : null);
    if (id("patientId")) return id("patientId");
    if (id("caseId")) {
      const c = await this.db.client.case.findUnique({ where: { id: id("caseId")! }, select: { patientId: true } });
      if (c) return c.patientId;
    }
    if (id("routingId")) {
      const r = await this.db.client.routing.findUnique({ where: { id: id("routingId")! }, select: { case: { select: { patientId: true } } } });
      if (r) return r.case.patientId;
    }
    return actor.type === "patient" ? (actor.id ?? null) : null;
  }
}
