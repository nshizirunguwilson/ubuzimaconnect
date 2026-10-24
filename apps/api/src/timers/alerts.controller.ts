import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { DbService } from "../common/db.service";
import { Auth } from "../auth/guard";

/** FR 12.7: the administrator's alerts, newest first, and marking them read. */
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
    const cases = await this.db.client.case.findMany({ where: { id: { in: alerts.flatMap((a) => (a.caseId ? [a.caseId] : [])) } }, select: { id: true, code: true, status: true } });
    return {
      unread,
      alerts: alerts.map((a) => ({ id: a.id, kind: a.kind, message: a.message, emailed: a.emailed, read: !!a.readAt, at: a.createdAt, case: cases.find((c) => c.id === a.caseId) ?? null })),
    };
  }

  @Post("read")
  @HttpCode(200)
  async read() {
    await this.db.client.alert.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
