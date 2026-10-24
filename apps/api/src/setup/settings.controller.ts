import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";

/** FR 4.8: the administrator switches the AI off and on. While off, every new case is Uncertain. */
@Controller("settings")
@Auth({ kind: "staff", roles: ["ADMIN"] })
export class SettingsController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  @Get()
  async get() {
    const s = await this.db.client.systemSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const by = s.updatedById ? await this.db.client.staff.findUnique({ where: { id: s.updatedById }, select: { name: true } }) : null;
    return { aiEnabled: s.aiEnabled, updatedAt: s.updatedAt, updatedBy: by?.name ?? null };
  }

  @Put()
  async set(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const { aiEnabled } = parse(z.object({ aiEnabled: z.boolean() }), body);
    await this.db.client.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, aiEnabled, updatedById: s.staffId },
      update: { aiEnabled, updatedById: s.staffId },
    });
    await this.audit.record({ type: "staff", id: s.staffId }, aiEnabled ? "settings.ai.on" : "settings.ai.off", undefined, req.ip);
    return { ok: true };
  }
}
