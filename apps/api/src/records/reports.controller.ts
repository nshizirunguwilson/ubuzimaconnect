import { Controller, Get, Header, Query, Req, Res } from "@nestjs/common";
import { PERIODS, type Period } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { AuditService } from "../common/audit.service";
import { ApiException } from "../common/errors";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { reportCsv, ReportsService } from "./reports.service";

const today = () => new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);

/** FR 12.8: every staff role gets its own report; patients get the printable summary (FR 7.2). */
@Controller("reports")
@Auth({ kind: "staff" })
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private audit: AuditService,
  ) {}

  @Get()
  get(@CurrentSession() s: LiveSession, @Query("period") period?: string, @Query("date") date?: string) {
    return this.build(s, period, date);
  }

  /** The same report as a spreadsheet file. Downloads are logged: a report holds staff names and counts. */
  @Get("csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async csv(@CurrentSession() s: LiveSession, @Req() req: Request, @Res({ passthrough: true }) res: Response, @Query("period") period?: string, @Query("date") date?: string) {
    const rep = await this.build(s, period, date);
    res.setHeader("Content-Disposition", `attachment; filename="ubuzimaconnect-report-${rep.period}-${rep.start}.csv"`);
    await this.audit.record({ type: "staff", id: s.staffId }, "report.downloaded", { period: rep.period, start: rep.start }, req.ip);
    return reportCsv(rep);
  }

  private build(s: LiveSession, period = "week", date = today()) {
    if (!(PERIODS as readonly string[]).includes(period)) throw new ApiException(400, "VALIDATION", "Choose day, week or month.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new ApiException(400, "VALIDATION", "Choose a date.");
    const me = s.staff!;
    if (me.role === "FACILITY_MANAGER" && !me.facilityId) throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility.");
    return this.reports.build(me.role, me.id, me.facilityId, period as Period, date);
  }
}
