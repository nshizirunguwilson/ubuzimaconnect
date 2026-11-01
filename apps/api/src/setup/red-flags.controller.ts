import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req } from "@nestjs/common";
import { redFlagQuestion } from "@ubuzima/shared";
import type { Request } from "express";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";

/**
 * The danger-sign questions. Only the administrator adds, edits or removes them. Changes apply to new cases only
 * (a case keeps the text it was asked), and every change is logged.
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
    return this.db.client.redFlagQuestion.findMany({
      where: { active: true },
      orderBy: [{ group: "asc" }, { sortOrder: "asc" }],
    });
  }

  /** Adds a question at the end, with the next code in its group (A5, C3 and so on). */
  @Post()
  async create(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const question = parse(redFlagQuestion, body);
    const inGroup = await this.db.client.redFlagQuestion.count({ where: { group: question.group } });
    const last = await this.db.client.redFlagQuestion.aggregate({ _max: { sortOrder: true } });

    const created = await this.db.client.redFlagQuestion.create({
      data: {
        ...question,
        textRw: question.textRw || null,
        source: question.source || null,
        code: `${question.group}${inGroup + 1}`,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
    await this.audit.record({ type: "staff", id: session.staffId }, "redflag.added", { code: created.code }, request.ip);
    return { id: created.id };
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const before = await this.find(id);
    const question = parse(redFlagQuestion, body);
    await this.db.client.redFlagQuestion.update({
      where: { id },
      data: { ...question, textRw: question.textRw || null, source: question.source || null },
    });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "redflag.edited",
      { code: before.code, before: { textEn: before.textEn, service: before.service } },
      request.ip,
    );
    return { ok: true };
  }

  /** Removing hides the question from new cases. It is kept, so older cases still show it. */
  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const question = await this.find(id);
    await this.db.client.redFlagQuestion.update({ where: { id }, data: { active: false } });
    await this.audit.record({ type: "staff", id: session.staffId }, "redflag.removed", { code: question.code }, request.ip);
    return { ok: true };
  }

  private async find(id: string) {
    const question = await this.db.client.redFlagQuestion.findFirst({ where: { id, active: true } });
    if (!question) throw new ApiException(404, "NOT_FOUND", "This question doesn't exist.");
    return question;
  }
}
