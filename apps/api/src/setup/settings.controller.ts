import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";

/** The administrator switches the AI off and on. While it is off, every new case is Uncertain. */
@Controller("settings")
@Auth({ kind: "staff", roles: ["ADMIN"] })
export class SettingsController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  @Get()
  async get() {
    const settings = await this.db.client.systemSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const updatedBy = settings.updatedById
      ? await this.db.client.staff.findUnique({ where: { id: settings.updatedById }, select: { name: true } })
      : null;
    return { aiEnabled: settings.aiEnabled, updatedAt: settings.updatedAt, updatedBy: updatedBy?.name ?? null };
  }

  @Put()
  async set(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const { aiEnabled } = parse(z.object({ aiEnabled: z.boolean() }), body);
    await this.db.client.systemSettings.upsert({
      where: { id: 1 },
      create: { id: 1, aiEnabled, updatedById: session.staffId },
      update: { aiEnabled, updatedById: session.staffId },
    });
    const action = aiEnabled ? "settings.ai.on" : "settings.ai.off";
    await this.audit.record({ type: "staff", id: session.staffId }, action, undefined, request.ip);
    return { ok: true };
  }
}
