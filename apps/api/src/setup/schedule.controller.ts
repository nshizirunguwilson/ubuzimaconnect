import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from "@nestjs/common";
import { addDays, currentShift, SERVICES, SHIFTS, shiftToggle, unavailability, weekDays, weekStart, type Service, type ShiftType } from "@ubuzima/shared";
import type { Request } from "express";
import { z } from "zod";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { RoutingService } from "../cases/routing.service";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const validWeek = (w?: string) => weekStart(w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? w : currentShift().date);

/**
 * Weekly schedules: the facility manager plans their clinicians (FR 8.4), the administrator plans
 * agents (FR 12.4). One grid, two scopes. Each shift also reports its gaps.
 */
@Controller("schedule")
export class ScheduleController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  @Get()
  @Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
  async week(@Query("week") w: string | undefined, @CurrentSession() s: LiveSession) {
    const monday = validWeek(w);
    const days = weekDays(monday);
    const scope = this.scope(s);
    const people = await this.db.client.staff.findMany({
      where: { ...scope, status: { not: "DEACTIVATED" } },
      orderBy: [{ specialty: "asc" }, { name: "asc" }],
      select: { id: true, name: true, specialty: true, status: true },
    });
    const assignments = await this.db.client.shiftAssignment.findMany({
      where: { staffId: { in: people.map((p) => p.id) }, date: { gte: day(days[0]), lte: day(days[6]) } },
      select: { id: true, staffId: true, date: true, shift: true, unavailable: true, unavailableReason: true },
    });
    const rows = assignments.map((a) => ({ ...a, date: isoOf(a.date) }));

    // FR 8.4: any shift without a clinician of a service the facility offers. Agents: any shift with nobody (NFR 12).
    const offered: Service[] = s.staff!.role === "FACILITY_MANAGER"
      ? ((await this.db.client.facility.findUnique({ where: { id: s.staff!.facilityId! } }))?.services ?? [])
      : [];
    const gaps = days.flatMap((date) =>
      SHIFTS.map((shift) => {
        const on = rows.filter((r) => r.date === date && r.shift === shift && !r.unavailable);
        const missing = s.staff!.role === "ADMIN"
          ? on.length === 0 ? ["AGENT"] : []
          : offered.filter((svc) => !on.some((r) => people.find((p) => p.id === r.staffId)?.specialty === svc));
        return { date, shift, missing };
      }),
    );
    return { monday, days, now: currentShift(), people, assignments: rows, gaps, services: SERVICES };
  }

  @Put()
  @Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
  async toggle(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const t = parse(shiftToggle, body);
    const person = await this.db.client.staff.findFirst({ where: { id: t.staffId, ...this.scope(s), status: { not: "DEACTIVATED" } } });
    if (!person) throw new ApiException(404, "NOT_FOUND", "This person isn't on your schedule.");
    const key = { staffId_date_shift: { staffId: t.staffId, date: day(t.date), shift: t.shift as ShiftType } };
    if (t.assigned) {
      await this.db.client.shiftAssignment.upsert({ where: key, create: { staffId: t.staffId, date: day(t.date), shift: t.shift, createdById: s.staffId! }, update: {} });
    } else {
      await this.db.client.shiftAssignment.deleteMany({ where: { staffId: t.staffId, date: day(t.date), shift: t.shift } });
    }
    await this.audit.record({ type: "staff", id: s.staffId }, t.assigned ? "schedule.assigned" : "schedule.removed", { staffId: t.staffId, date: t.date, shift: t.shift }, req.ip);
    return { ok: true };
  }

  /**
   * D77: copy the week before into this week, for everyone on this schedule. Shifts already planned stay, and shifts
   * that have already started are not added. Returns how many were added.
   */
  @Post("copy")
  @HttpCode(200)
  @Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
  async copy(@Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const { week } = parse(z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), body);
    const monday = validWeek(week);
    const days = weekDays(monday);
    const before = weekDays(addDays(monday, -7));
    const people = await this.db.client.staff.findMany({ where: { ...this.scope(s), status: { not: "DEACTIVATED" } }, select: { id: true } });
    const source = await this.db.client.shiftAssignment.findMany({
      where: { staffId: { in: people.map((p) => p.id) }, date: { gte: day(before[0]), lte: day(before[6]) } },
      select: { staffId: true, date: true, shift: true },
    });
    const now = currentShift();
    const started = (date: string, shift: ShiftType) => date < now.date || (date === now.date && (shift === "DAY" || now.shift === "NIGHT"));
    const rows = source
      .map((a) => ({ staffId: a.staffId, date: addDays(isoOf(a.date), 7), shift: a.shift as ShiftType }))
      .filter((a) => days.includes(a.date) && !started(a.date, a.shift))
      .map((a) => ({ ...a, date: day(a.date), createdById: s.staffId! }));
    const { count } = await this.db.client.shiftAssignment.createMany({ data: rows, skipDuplicates: true });
    await this.audit.record({ type: "staff", id: s.staffId }, "schedule.copied", { week: monday, added: count }, req.ip);
    return { added: count };
  }

  /** Administrator → agents; facility manager → clinicians at their facility. */
  private scope(s: LiveSession) {
    if (s.staff!.role === "ADMIN") return { role: "AGENT" as const };
    if (!s.staff!.facilityId) throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility.");
    return { role: "CLINICIAN" as const, facilityId: s.staff!.facilityId };
  }
}

/** FR 8.5: a clinician sees their own shifts and marks themselves unavailable for one. */
@Controller("me/shifts")
@Auth({ kind: "staff", roles: ["CLINICIAN", "AGENT"] })
export class MyShiftsController {
  constructor(
    private db: DbService,
    private audit: AuditService,
    private routing: RoutingService,
  ) {}

  @Get()
  async mine(@Query("week") w: string | undefined, @CurrentSession() s: LiveSession) {
    const days = weekDays(validWeek(w));
    const rows = await this.db.client.shiftAssignment.findMany({
      where: { staffId: s.staffId!, date: { gte: day(days[0]), lte: day(days[6]) } },
      orderBy: [{ date: "asc" }, { shift: "asc" }],
      select: { id: true, date: true, shift: true, unavailable: true, unavailableReason: true },
    });
    return { monday: days[0], days, now: currentShift(), shifts: rows.map((r) => ({ ...r, date: isoOf(r.date) })) };
  }

  @Post(":id/unavailable")
  @HttpCode(200)
  @Auth({ kind: "staff", roles: ["CLINICIAN"] })
  async mark(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const input = parse(unavailability, body);
    const shift = await this.db.client.shiftAssignment.findFirst({ where: { id, staffId: s.staffId! } });
    if (!shift) throw new ApiException(404, "NOT_FOUND", "This shift isn't yours.");
    const now = currentShift();
    const ended = isoOf(shift.date) < now.date || (isoOf(shift.date) === now.date && shift.shift === "DAY" && now.shift === "NIGHT");
    if (ended) throw new ApiException(400, "VALIDATION", "This shift has already ended.");
    await this.db.client.shiftAssignment.update({
      where: { id },
      data: { unavailable: input.unavailable, unavailableReason: input.unavailable ? input.reason || null : null },
    });
    await this.audit.record({ type: "staff", id: s.staffId }, input.unavailable ? "shift.unavailable" : "shift.available", { shiftId: id }, req.ip);
    // FR 8.5, 5.13: unavailable for the shift that is on now takes effect at once for patients on the way.
    if (input.unavailable && isoOf(shift.date) === now.date && shift.shift === now.shift) await this.routing.reassignFrom(s.staffId!, "Clinician marked unavailable");
    return { ok: true };
  }
}
