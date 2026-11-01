import { Controller, Get, Header, Query, Req, Res } from "@nestjs/common";
import { PERIODS, type Period } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { AuditService } from "../common/audit.service";
import { ApiException } from "../common/errors";
import { reportCsv, ReportsService } from "./reports.service";

/** Today's date in Kigali (UTC+2), as YYYY-MM-DD. */
function kigaliToday() {
  return new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 10);
}

/** Every staff role gets its own report, on screen or as a spreadsheet file. */
@Controller("reports")
@Auth({ kind: "staff" })
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private audit: AuditService,
  ) {}

  @Get()
  get(@CurrentSession() session: LiveSession, @Query("period") period?: string, @Query("date") date?: string) {
    return this.build(session, period, date);
  }

  /** The same report as a spreadsheet file. Downloads are logged, because a report holds staff names and counts. */
  @Get("csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async csv(
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query("period") period?: string,
    @Query("date") date?: string,
  ) {
    const report = await this.build(session, period, date);
    const fileName = `ubuzimaconnect-report-${report.period}-${report.start}.csv`;
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "report.downloaded",
      { period: report.period, start: report.start },
      request.ip,
    );
    return reportCsv(report);
  }

  private build(session: LiveSession, period = "week", date = kigaliToday()) {
    if (!(PERIODS as readonly string[]).includes(period)) {
      throw new ApiException(400, "VALIDATION", "Choose day, week or month.");
    }
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
    if (!isValidDate) throw new ApiException(400, "VALIDATION", "Choose a date.");

    const me = session.staff!;
    if (me.role === "FACILITY_MANAGER" && !me.facilityId) {
      throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility.");
    }
    return this.reports.build(me.role, me.id, me.facilityId, period as Period, date);
  }
}
