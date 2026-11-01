import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from "@nestjs/common";
import {
  addDays,
  currentShift,
  SERVICES,
  shiftHasEnded,
  shiftHasStarted,
  SHIFTS,
  shiftToggle,
  unavailability,
  weekDays,
  weekStart,
  type Service,
  type ShiftType,
} from "@ubuzima/shared";
import type { Request } from "express";
import { z } from "zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { RoutingService } from "../cases/routing.service";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD date as the database stores a date-only value. */
function toDbDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** A date-only database value as YYYY-MM-DD. */
function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The Monday of the requested week, or of this week when none (or nonsense) is given. */
function mondayOf(week?: string) {
  const anyDay = week && ISO_DATE.test(week) ? week : currentShift().date;
  return weekStart(anyDay);
}

/**
 * Weekly schedules. The facility manager plans their clinicians, and the administrator plans the agents:
 * one grid, two scopes. Each shift also reports what it is missing.
 */
@Controller("schedule")
export class ScheduleController {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  @Get()
  @Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
  async week(@Query("week") week: string | undefined, @CurrentSession() session: LiveSession) {
    const monday = mondayOf(week);
    const days = weekDays(monday);
    const people = await this.db.client.staff.findMany({
      where: { ...this.scope(session), status: { not: "DEACTIVATED" } },
      orderBy: [{ specialty: "asc" }, { name: "asc" }],
      select: { id: true, name: true, specialty: true, status: true },
    });
    const found = await this.db.client.shiftAssignment.findMany({
      where: {
        staffId: { in: people.map((person) => person.id) },
        date: { gte: toDbDate(days[0]), lte: toDbDate(days[6]) },
      },
      select: { id: true, staffId: true, date: true, shift: true, unavailable: true, unavailableReason: true },
    });
    const assignments = found.map((assignment) => ({ ...assignment, date: toIsoDate(assignment.date) }));

    const gaps = await this.findGaps(session, days, people, assignments);
    return { monday, days, now: currentShift(), people, assignments, gaps, services: SERVICES };
  }

  /** Adds a person to a shift, or takes them off it. */
  @Put()
  @Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
  async toggle(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const change = parse(shiftToggle, body);
    const person = await this.db.client.staff.findFirst({
      where: { id: change.staffId, ...this.scope(session), status: { not: "DEACTIVATED" } },
    });
    if (!person) throw new ApiException(404, "NOT_FOUND", "This person isn't on your schedule.");

    const date = toDbDate(change.date);
    const shift = change.shift as ShiftType;
    if (change.assigned) {
      await this.db.client.shiftAssignment.upsert({
        where: { staffId_date_shift: { staffId: change.staffId, date, shift } },
        create: { staffId: change.staffId, date, shift, createdById: session.staffId! },
        update: {},
      });
    } else {
      await this.db.client.shiftAssignment.deleteMany({ where: { staffId: change.staffId, date, shift } });
    }

    await this.audit.record(
      { type: "staff", id: session.staffId },
      change.assigned ? "schedule.assigned" : "schedule.removed",
      { staffId: change.staffId, date: change.date, shift: change.shift },
      request.ip,
    );
    return { ok: true };
  }

  /**
   * Copies the week before into this week, for everyone on this schedule. Shifts already planned stay,
   * and shifts that have already started are not added. Returns how many were added.
   */
  @Post("copy")
  @HttpCode(200)
  @Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
  async copy(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    const { week } = parse(z.object({ week: z.string().regex(ISO_DATE) }), body);
    const monday = mondayOf(week);
    const thisWeek = weekDays(monday);
    const weekBefore = weekDays(addDays(monday, -7));

    const people = await this.db.client.staff.findMany({
      where: { ...this.scope(session), status: { not: "DEACTIVATED" } },
      select: { id: true },
    });
    const previous = await this.db.client.shiftAssignment.findMany({
      where: {
        staffId: { in: people.map((person) => person.id) },
        date: { gte: toDbDate(weekBefore[0]), lte: toDbDate(weekBefore[6]) },
      },
      select: { staffId: true, date: true, shift: true },
    });

    const now = currentShift();
    const copies = previous
      .map((assignment) => ({
        staffId: assignment.staffId,
        date: addDays(toIsoDate(assignment.date), 7),
        shift: assignment.shift as ShiftType,
      }))
      .filter((copy) => thisWeek.includes(copy.date) && !shiftHasStarted(copy.date, copy.shift, now))
      .map((copy) => ({ ...copy, date: toDbDate(copy.date), createdById: session.staffId! }));

    const { count } = await this.db.client.shiftAssignment.createMany({ data: copies, skipDuplicates: true });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      "schedule.copied",
      { week: monday, added: count },
      request.ip,
    );
    return { added: count };
  }

  /** The administrator plans agents; a facility manager plans the clinicians at their facility. */
  private scope(session: LiveSession) {
    const staff = session.staff!;
    if (staff.role === "ADMIN") return { role: "AGENT" as const };
    if (!staff.facilityId) throw new ApiException(404, "NOT_FOUND", "Your account isn't linked to a facility.");
    return { role: "CLINICIAN" as const, facilityId: staff.facilityId };
  }

  /**
   * What each shift is missing. Agents: any shift with nobody on it.
   * Clinicians: each service the facility offers with no clinician of that specialty on duty.
   */
  private async findGaps(
    session: LiveSession,
    days: string[],
    people: { id: string; specialty: Service | null }[],
    assignments: { staffId: string; date: string; shift: ShiftType; unavailable: boolean }[],
  ) {
    const staff = session.staff!;
    const isAgentSchedule = staff.role === "ADMIN";

    let servicesOffered: Service[] = [];
    if (staff.role === "FACILITY_MANAGER") {
      const facility = await this.db.client.facility.findUnique({ where: { id: staff.facilityId! } });
      servicesOffered = (facility?.services as Service[]) ?? [];
    }
    const specialtyOf = (staffId: string) => people.find((person) => person.id === staffId)?.specialty;

    return days.flatMap((date) =>
      SHIFTS.map((shift) => {
        const onDuty = assignments.filter(
          (assignment) => assignment.date === date && assignment.shift === shift && !assignment.unavailable,
        );

        let missing: (Service | "AGENT")[];
        if (isAgentSchedule) {
          missing = onDuty.length === 0 ? ["AGENT"] : [];
        } else {
          missing = servicesOffered.filter(
            (service) => !onDuty.some((assignment) => specialtyOf(assignment.staffId) === service),
          );
        }
        return { date, shift, missing };
      }),
    );
  }
}

/** A clinician's or agent's own shifts. A clinician can mark themselves unavailable for one. */
@Controller("me/shifts")
@Auth({ kind: "staff", roles: ["CLINICIAN", "AGENT"] })
export class MyShiftsController {
  constructor(
    private db: DbService,
    private audit: AuditService,
    private routing: RoutingService,
  ) {}

  @Get()
  async mine(@Query("week") week: string | undefined, @CurrentSession() session: LiveSession) {
    const days = weekDays(mondayOf(week));
    const shifts = await this.db.client.shiftAssignment.findMany({
      where: { staffId: session.staffId!, date: { gte: toDbDate(days[0]), lte: toDbDate(days[6]) } },
      orderBy: [{ date: "asc" }, { shift: "asc" }],
      select: { id: true, date: true, shift: true, unavailable: true, unavailableReason: true },
    });
    return {
      monday: days[0],
      days,
      now: currentShift(),
      shifts: shifts.map((shift) => ({ ...shift, date: toIsoDate(shift.date) })),
    };
  }

  @Post(":id/unavailable")
  @HttpCode(200)
  @Auth({ kind: "staff", roles: ["CLINICIAN"] })
  async mark(
    @Param("id", ParseUUIDPipe) shiftId: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const input = parse(unavailability, body);
    const shift = await this.db.client.shiftAssignment.findFirst({ where: { id: shiftId, staffId: session.staffId! } });
    if (!shift) throw new ApiException(404, "NOT_FOUND", "This shift isn't yours.");

    const date = toIsoDate(shift.date);
    const now = currentShift();
    if (shiftHasEnded(date, shift.shift, now)) {
      throw new ApiException(400, "VALIDATION", "This shift has already ended.");
    }

    await this.db.client.shiftAssignment.update({
      where: { id: shiftId },
      data: {
        unavailable: input.unavailable,
        unavailableReason: input.unavailable ? input.reason || null : null,
      },
    });
    await this.audit.record(
      { type: "staff", id: session.staffId },
      input.unavailable ? "shift.unavailable" : "shift.available",
      { shiftId },
      request.ip,
    );

    // Unavailable for the shift that is on now: patients on their way to this clinician go to a colleague at once.
    const isCurrentShift = date === now.date && shift.shift === now.shift;
    if (input.unavailable && isCurrentShift) {
      await this.routing.reassignFrom(session.staffId!, "Clinician marked unavailable");
    }
    return { ok: true };
  }
}
