import { Injectable } from "@nestjs/common";
import { DbService } from "./db.service";

/** Views by the same person of the same record within this time count as one. */
const VIEW_WINDOW_MS = 10 * 60_000;

export type Actor = { type: "patient" | "staff" | "anonymous" | "system"; id?: string | null };

type Detail = Record<string, unknown>;

/**
 * The activity log: an append-only record of security and care events (the database refuses edits and deletes).
 * It never stores secrets or national IDs.
 * Each event is linked to the patient whose record it touched, so a patient can see who looked at their data.
 */
@Injectable()
export class AuditService {
  constructor(private db: DbService) {}

  async record(actor: Actor, action: string, detail?: Detail, ip?: string) {
    const patientId = await this.findPatient(actor, detail);
    return this.db.client.auditEvent.create({
      data: {
        actorType: actor.type,
        actorId: actor.id ?? null,
        action,
        detail: detail as object | undefined,
        ip,
        patientId,
      },
    });
  }

  /**
   * Logs that someone opened a record, at most once per sitting. Screens refresh after every chat message,
   * and without this the patient's activity list would show the same person many times.
   */
  async viewed(actor: Actor, action: "record.viewed" | "records.viewed", detail: Detail, ip?: string) {
    const patientId = await this.findPatient(actor, detail);
    const viewsInWindow = await this.db.client.auditEvent.count({
      where: {
        action,
        actorType: actor.type,
        actorId: actor.id ?? null,
        patientId,
        createdAt: { gte: new Date(Date.now() - VIEW_WINDOW_MS) },
      },
    });
    if (viewsInWindow === 0) {
      await this.record(actor, action, detail, ip);
    }
  }

  /**
   * The patient an event is about, looked for in this order: a patientId in the detail, the patient of the
   * case or routing in the detail, or the patient themself when they are the one acting.
   */
  private async findPatient(actor: Actor, detail?: Detail): Promise<string | null> {
    const patientId = textField(detail, "patientId");
    if (patientId) return patientId;

    const caseId = textField(detail, "caseId");
    if (caseId) {
      const found = await this.db.client.case.findUnique({ where: { id: caseId }, select: { patientId: true } });
      if (found) return found.patientId;
    }

    const routingId = textField(detail, "routingId");
    if (routingId) {
      const found = await this.db.client.routing.findUnique({
        where: { id: routingId },
        select: { case: { select: { patientId: true } } },
      });
      if (found) return found.case.patientId;
    }

    if (actor.type === "patient") return actor.id ?? null;
    return null;
  }
}

/** A text value from the event detail, or null when it is missing or not text. */
function textField(detail: Detail | undefined, key: string): string | null {
  const value = detail?.[key];
  return typeof value === "string" ? value : null;
}
