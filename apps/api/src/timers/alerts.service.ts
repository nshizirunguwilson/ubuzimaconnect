import { Injectable } from "@nestjs/common";
import type { AlertKind } from "@ubuzima/db";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { env } from "../common/env";
import { MailService } from "../common/mail.service";
import { EventsService } from "../live/events.service";

const SUBJECT: Record<AlertKind, string> = {
  ESCALATION: "A case is waiting for an agent",
  DELAY_INCIDENT: "Delay incident: a case has waited more than 5 minutes",
  NO_AGENT: "No agent has been online for 5 minutes",
  NO_CAPACITY: "No facility could take a case",
  AI_FAILURES: "The AI service is failing",
};

/**
 * FR 12.7: the administrator is told about escalations, no agent online, no-capacity events and AI failures.
 * Every alert is saved and pushed live to open administrator screens; the serious ones are also emailed
 * (FR 6.11), because the administrator may not have the app open.
 */
@Injectable()
export class AlertsService {
  constructor(
    private db: DbService,
    private events: EventsService,
    private mail: MailService,
    private audit: AuditService,
  ) {}

  async raise(kind: AlertKind, message: string, opts: { caseId?: string; email?: boolean } = {}) {
    const alert = await this.db.client.alert.create({ data: { kind, message, caseId: opts.caseId ?? null, emailed: !!opts.email } });
    this.events.emit("admins", { type: "admin-alert", kind, text: message });
    if (opts.email) {
      const admins = await this.db.client.staff.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } });
      const text = `${message}\n\nOpen the alerts: ${env.webUrl}/staff/alerts`;
      for (const a of admins) await this.mail.send(a.email, `UbuzimaConnect: ${SUBJECT[kind]}`, text);
    }
    await this.audit.record({ type: "system" }, "alert.raised", { kind, caseId: opts.caseId, alertId: alert.id });
    return alert;
  }
}
