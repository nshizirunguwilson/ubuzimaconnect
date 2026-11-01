import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { DbService } from "../common/db.service";
import { Auth } from "../auth/guard";

/** The administrator's alerts, newest first, and marking them as read. */
@Controller("alerts")
@Auth({ kind: "staff", roles: ["ADMIN"] })
export class AlertsController {
  constructor(private db: DbService) {}

  @Get()
  async list() {
    const [alerts, unread] = await Promise.all([
      this.db.client.alert.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      this.db.client.alert.count({ where: { readAt: null } }),
    ]);
    const caseIds = alerts.flatMap((alert) => (alert.caseId ? [alert.caseId] : []));
    const cases = await this.db.client.case.findMany({
      where: { id: { in: caseIds } },
      select: { id: true, code: true, status: true },
    });

    return {
      unread,
      alerts: alerts.map((alert) => ({
        id: alert.id,
        kind: alert.kind,
        message: alert.message,
        emailed: alert.emailed,
        read: alert.readAt !== null,
        at: alert.createdAt,
        case: cases.find((found) => found.id === alert.caseId) ?? null,
      })),
    };
  }

  @Post("read")
  @HttpCode(200)
  async read() {
    await this.db.client.alert.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
