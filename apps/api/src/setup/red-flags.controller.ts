import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from "@nestjs/common";
import { redFlagQuestion } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";

/**
 * FR 12.6: only the administrator adds, edits or removes red-flag questions. Changes apply to new
 * cases only (cases keep the text they were asked) and every change is logged.
 */
@Controller("red-flags")
@Auth({ kind: "staff", roles: ["ADMIN"] })
export class RedFlagsController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.db.client.redFlagQuestion.findMany({ where: { active: true }, orderBy: [{ group: "asc" }, { sortOrder: "asc" }] });
  }

  @Post()
  async create(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const q = parse(redFlagQuestion, body);
    const inGroup = await this.db.client.redFlagQuestion.count({ where: { group: q.group } });
    const last = await this.db.client.redFlagQuestion.aggregate({ _max: { sortOrder: true } });
    const created = await this.db.client.redFlagQuestion.create({
      data: { ...q, textRw: q.textRw || null, source: q.source || null, code: `${q.group}${inGroup + 1}`, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await this.audit.record({ type: "staff", id: s.staffId }, "redflag.added", { code: created.code }, req.ip);
    return { id: created.id };
  }

  @Put(":id")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const before = await this.find(id);
    const q = parse(redFlagQuestion, body);
    await this.db.client.redFlagQuestion.update({ where: { id }, data: { ...q, textRw: q.textRw || null, source: q.source || null } });
    await this.audit.record({ type: "staff", id: s.staffId }, "redflag.edited", { code: before.code, before: { textEn: before.textEn, service: before.service } }, req.ip);
    return { ok: true };
  }

  /** Removing hides the question from new cases; it is kept so older cases still show it. */
  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const q = await this.find(id);
    await this.db.client.redFlagQuestion.update({ where: { id }, data: { active: false } });
    await this.audit.record({ type: "staff", id: s.staffId }, "redflag.removed", { code: q.code }, req.ip);
    return { ok: true };
  }

  private async find(id: string) {
    const q = await this.db.client.redFlagQuestion.findFirst({ where: { id, active: true } });
    if (!q) throw new ApiException(404, "NOT_FOUND", "This question doesn't exist.");
    return q;
  }
}
