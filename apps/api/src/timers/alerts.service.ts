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
 * Alerts for the administrator: escalations, no agent online, no facility able to take a case, and AI failures.
 * Every alert is saved and pushed live to open administrator screens. The serious ones are also emailed,
 * because the administrator may not have the app open.
 */
@Injectable()
export class AlertsService {
  constructor(
    private db: DbService,
    private events: EventsService,
    private mail: MailService,
    private audit: AuditService,
  ) {}

  async raise(kind: AlertKind, message: string, options: { caseId?: string; email?: boolean } = {}) {
    const sendEmail = options.email === true;
    const alert = await this.db.client.alert.create({
      data: { kind, message, caseId: options.caseId ?? null, emailed: sendEmail },
    });
    this.events.emit("admins", { type: "admin-alert", kind, text: message });

    if (sendEmail) {
      const admins = await this.db.client.staff.findMany({
        where: { role: "ADMIN", status: "ACTIVE" },
        select: { email: true },
      });
      const text = `${message}\n\nOpen the alerts: ${env.webUrl}/staff/alerts`;
      for (const admin of admins) {
        await this.mail.send(admin.email, `UbuzimaConnect: ${SUBJECT[kind]}`, text);
      }
    }

    await this.audit.record({ type: "system" }, "alert.raised", { kind, caseId: options.caseId, alertId: alert.id });
    return alert;
  }

  /**
   * The 2-minute repeat for a case still waiting (FR 6.11). It refreshes one "Still waiting" alert per case,
   * marked unread again with the new waiting time, instead of adding a row every 2 minutes: a case left
   * waiting for days once filled the list with thousands of identical alerts.
   */
  async repeat(kind: AlertKind, message: string, caseId: string) {
    const existing = await this.db.client.alert.findFirst({
      where: { kind, caseId, message: { startsWith: "Still waiting:" } },
      orderBy: { createdAt: "desc" },
    });
    const alert = existing
      ? await this.db.client.alert.update({
          where: { id: existing.id },
          data: { message, createdAt: new Date(), readAt: null },
        })
      : await this.db.client.alert.create({ data: { kind, message, caseId, emailed: false } });
    this.events.emit("admins", { type: "admin-alert", kind, text: message });
    await this.audit.record({ type: "system" }, "alert.repeated", { kind, caseId, alertId: alert.id });
    return alert;
  }
}
