import { Injectable } from "@nestjs/common";
import { OUTCOME_LABEL, periodRange, SERVICE_LABEL, SHIFTS, type Period, type Service } from "@ubuzima/shared";
import { DbService } from "../common/db.service";
import { bedUsage } from "../setup/beds";

/** One number at the top of a report. A null value means "no data in this period": shown as a dash, never as 0. */
export type Tile = { label: string; value: number | null; unit?: "min" | "%" | "days" | "/5"; hint?: string };
export type Table = { title: string; columns: string[]; rows: (string | number | null)[][] };
export type Report = { title: string; period: Period; start: string; end: string; tiles: Tile[]; tables: Table[] };

type Range = ReturnType<typeof periodRange>;

const MINUTE = 60_000;
const MINUTES_PER_DAY = 60 * 24;
const TRIAGE_LEVELS = ["URGENT", "UNCERTAIN", "MINOR"] as const;

// Small statistics helpers. Each returns null for an empty list, so "no data" never shows as 0.

/** The middle value (the lower one of the two middle values when the count is even). */
function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** The value 90% of the others are at or below. */
function percentile90(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.9) - 1];
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number | null, digits = 1) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Minutes between two times, or null when either is missing. */
function minutesBetween(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  return (end.getTime() - start.getTime()) / MINUTE;
}

/** The list without its nulls. */
function withoutNulls<T>(values: (T | null)[]) {
  return values.filter((value): value is T => value !== null);
}

/** The YYYY-MM-DD date in Kigali (UTC+2) of a moment. */
function kigaliDay(moment: Date) {
  return new Date(moment.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
}

/** The YYYY-MM-DD of a date-only database value. */
function dayOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** "URGENT" becomes "Urgent". */
function capitalised(word: string) {
  return word[0] + word.slice(1).toLowerCase();
}

/**
 * Each role's report for one day, week or month. Everything is counted from the records the app already keeps
 * (cases, routings and the activity log), so a report can never disagree with what happened.
 */
@Injectable()
export class ReportsService {
  constructor(private db: DbService) {}

  async build(
    role: string,
    staffId: string,
    facilityId: string | null,
    period: Period,
    anchor: string,
  ): Promise<Report> {
    const range = periodRange(period, anchor);
    const header = { period, start: range.start, end: range.end };

    if (role === "ADMIN") return { ...header, ...(await this.adminReport(range)) };
    if (role === "FACILITY_MANAGER") return { ...header, ...(await this.facilityReport(range, facilityId!)) };
    if (role === "AGENT") return { ...header, ...(await this.agentReport(range, staffId)) };
    return { ...header, ...(await this.clinicianReport(range, staffId)) };
  }

  /** The administrator's view of the whole service. */
  private async adminReport(range: Range) {
    const inPeriod = { gte: range.from, lt: range.to };
    const [created, closed, accepted, events] = await Promise.all([
      this.db.client.case.findMany({ where: { createdAt: inPeriod }, select: { triageLevel: true } }),
      this.db.client.case.findMany({
        where: { closedAt: inPeriod },
        select: { triageLevel: true, outcome: true, rating: true, agentId: true, assignedAt: true, closedAt: true },
      }),
      this.db.client.case.findMany({
        where: { assignedAt: inPeriod, queuedAt: { not: null } },
        select: { queuedAt: true, assignedAt: true },
      }),
      this.db.client.auditEvent.groupBy({
        by: ["action"],
        where: {
          createdAt: inPeriod,
          action: {
            in: [
              "case.delay_incident",
              "routing.no_beds",
              "routing.no_match",
              "routing.expired",
              "bed.released",
              "ai.failure",
            ],
          },
        },
        _count: true,
      }),
    ]);

    const eventCount = (action: string) => events.find((event) => event.action === action)?._count ?? 0;
    const waits = withoutNulls(accepted.map((found) => minutesBetween(found.queuedAt, found.assignedAt)));
    const ratings = withoutNulls(closed.map((found) => found.rating));

    // Minor cases closed without the patient having to travel.
    const minorClosed = closed.filter(
      (found) => found.triageLevel === "MINOR" && found.outcome !== "CANCELLED_BY_PATIENT",
    );
    const minorHandledRemotely = minorClosed.filter(
      (found) => found.outcome === "ADVISED_REMOTELY" || found.outcome === "PRESCRIPTION_ISSUED",
    );
    const remotePercent = minorClosed.length
      ? Math.round((minorHandledRemotely.length / minorClosed.length) * 100)
      : null;

    return {
      title: "Service report",
      tiles: [
        { label: "Requests", value: created.length },
        {
          label: "Median wait for an agent",
          value: round(median(waits)),
          unit: "min" as const,
          hint: waits.length ? `90% within ${round(percentile90(waits))} min` : undefined,
        },
        { label: "Delay incidents", value: eventCount("case.delay_incident"), hint: "Waited more than 5 minutes" },
        { label: "Minor cases closed without travel", value: remotePercent, unit: "%" as const },
        {
          label: "Average rating",
          value: round(average(ratings)),
          unit: "/5" as const,
          hint: ratings.length ? `${ratings.length} ratings` : undefined,
        },
        { label: "AI failures", value: eventCount("ai.failure") },
      ],
      tables: [
        {
          title: "Requests by triage level",
          columns: ["Level", "Requests"],
          rows: [
            ...TRIAGE_LEVELS.map((level) => [
              capitalised(level),
              created.filter((found) => found.triageLevel === level).length,
            ]),
            ["Not finished", created.filter((found) => !found.triageLevel).length],
          ],
        },
        {
          title: "Closed requests by outcome",
          columns: ["Outcome", "Requests"],
          rows: Object.entries(OUTCOME_LABEL).map(([outcome, label]) => [
            label,
            closed.filter((found) => found.outcome === outcome).length,
          ]),
        },
        {
          title: "Capacity and timers",
          columns: ["Event", "Count"],
          rows: [
            ["No free bed nearby", eventCount("routing.no_beds")],
            ["No facility could take the case", eventCount("routing.no_match")],
            ["Routings expired (no arrival in 24 h)", eventCount("routing.expired")],
            ["Bed reservations released", eventCount("bed.released")],
          ],
        },
        {
          title: "Agent performance",
          columns: ["Agent", "Cases closed", "Median handling (min)", "Average rating"],
          rows: await this.agentPerformanceRows(closed),
        },
        {
          title: "Scheduled and online agents",
          columns: ["Day", "Scheduled", "Of them online"],
          rows: await this.agentStaffingRows(range),
        },
      ],
    };
  }

  private async agentPerformanceRows(
    closed: { agentId: string | null; assignedAt: Date | null; closedAt: Date | null; rating: number | null }[],
  ) {
    const agents = await this.db.client.staff.findMany({
      where: { role: "AGENT" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return agents.map((agent) => {
      const theirs = closed.filter((found) => found.agentId === agent.id);
      const handlingTimes = withoutNulls(theirs.map((found) => minutesBetween(found.assignedAt, found.closedAt)));
      const ratings = withoutNulls(theirs.map((found) => found.rating));
      return [agent.name, theirs.length, round(median(handlingTimes)), round(average(ratings))];
    });
  }

  /**
   * Scheduled against online agents, per day. Scheduled: had a shift that day.
   * Online: changed their status or accepted a case that day.
   */
  private async agentStaffingRows(range: Range) {
    const [shifts, activity] = await Promise.all([
      this.db.client.shiftAssignment.findMany({
        where: {
          date: { gte: new Date(`${range.start}T00:00:00Z`), lt: new Date(`${range.end}T00:00:00Z`) },
          staff: { role: "AGENT" },
          unavailable: false,
        },
        select: { staffId: true, date: true },
      }),
      this.db.client.auditEvent.findMany({
        where: {
          createdAt: { gte: range.from, lt: range.to },
          action: { in: ["agent.status", "case.accepted"] },
          actorType: "staff",
        },
        select: { actorId: true, createdAt: true },
      }),
    ]);

    return range.days.map((day) => {
      const scheduled = new Set(shifts.filter((shift) => dayOf(shift.date) === day).map((shift) => shift.staffId));
      const online = new Set(
        activity.filter((event) => kigaliDay(event.createdAt) === day).map((event) => event.actorId),
      );
      const scheduledAndOnline = [...scheduled].filter((staffId) => online.has(staffId)).length;
      return [day, scheduled.size, scheduledAndOnline];
    });
  }

  /** A facility manager's report: their own facility only. */
  private async facilityReport(range: Range, facilityId: string) {
    const inPeriod = { gte: range.from, lt: range.to };
    const [facility, sent, arrived, ended, expired] = await Promise.all([
      this.db.client.facility.findUniqueOrThrow({ where: { id: facilityId } }),
      this.db.client.routing.findMany({
        where: { facilityId, createdAt: inPeriod, status: { notIn: ["CHANGED", "CANCELLED"] } },
        select: { caseId: true },
      }),
      this.db.client.routing.findMany({
        where: { facilityId, arrivedAt: inPeriod },
        select: { reservation: { select: { status: true } } },
      }),
      this.db.client.routing.findMany({
        where: { facilityId, endedAt: inPeriod, arrivedAt: { not: null } },
        select: { status: true, arrivedAt: true, endedAt: true },
      }),
      this.db.client.routing.count({ where: { facilityId, status: "EXPIRED", endedAt: inPeriod } }),
    ]);

    const beds = await bedUsage(this.db.client, facilityId);
    const bedsInUsePercent = facility.totalBeds
      ? Math.round(((beds.occupied + beds.reserved) / facility.totalBeds) * 100)
      : null;

    const stayMinutes = withoutNulls(
      ended
        .filter((visit) => visit.status !== "TRANSFERRED")
        .map((visit) => minutesBetween(visit.arrivedAt, visit.endedAt)),
    );
    const averageStay = average(stayMinutes);
    const averageStayDays = round(averageStay === null ? null : averageStay / MINUTES_PER_DAY, 1);

    const gaps = await this.shiftGaps(range, facilityId, facility.services as Service[]);
    const hadBed = (visit: { reservation: { status: string } | null }) => visit.reservation?.status === "USED";
    const endedAs = (status: string) => ended.filter((visit) => visit.status === status).length;

    return {
      title: `${facility.name}: facility report`,
      tiles: [
        { label: "Patients sent here", value: new Set(sent.map((routing) => routing.caseId)).size },
        { label: "Arrived", value: arrived.length },
        { label: "Did not come", value: expired, hint: "Routing expired after 24 hours" },
        {
          label: "Beds in use now",
          value: bedsInUsePercent,
          unit: "%" as const,
          hint: `${beds.occupied} occupied, ${beds.reserved} held, of ${facility.totalBeds}`,
        },
        { label: "Average length of stay", value: averageStayDays, unit: "days" as const },
        { label: "Shifts with a gap", value: gaps.length, hint: "A service offered with no clinician on duty" },
      ],
      tables: [
        {
          title: "Movements",
          columns: ["", "Patients"],
          rows: [
            ["Admitted (given a bed)", arrived.filter(hadBed).length],
            ["Seen without a bed", arrived.filter((visit) => !hadBed(visit)).length],
            ["Discharged", endedAs("DISCHARGED")],
            ["Visits completed", endedAs("COMPLETED")],
            ["Transferred out", endedAs("TRANSFERRED")],
          ],
        },
        { title: "Shift coverage gaps", columns: ["Day", "Shift", "Missing"], rows: gaps },
      ],
    };
  }

  /** Every shift in the period where a service the facility offers had no clinician on duty. */
  private async shiftGaps(range: Range, facilityId: string, servicesOffered: Service[]) {
    const clinicians = await this.db.client.staff.findMany({
      where: { facilityId, role: "CLINICIAN", status: { not: "DEACTIVATED" } },
      select: { id: true, specialty: true },
    });
    const shifts = await this.db.client.shiftAssignment.findMany({
      where: {
        staffId: { in: clinicians.map((clinician) => clinician.id) },
        date: { gte: new Date(`${range.start}T00:00:00Z`), lt: new Date(`${range.end}T00:00:00Z`) },
        unavailable: false,
      },
      select: { staffId: true, date: true, shift: true },
    });
    const specialtyOf = (staffId: string) => clinicians.find((clinician) => clinician.id === staffId)?.specialty;

    const gaps: string[][] = [];
    for (const day of range.days) {
      for (const shift of SHIFTS) {
        const specialtiesOnDuty = shifts
          .filter((assignment) => dayOf(assignment.date) === day && assignment.shift === shift)
          .map((assignment) => specialtyOf(assignment.staffId));
        const missing = servicesOffered.filter((service) => !specialtiesOnDuty.includes(service));
        if (missing.length > 0) {
          const shiftName = shift === "DAY" ? "Day" : "Night";
          gaps.push([day, shiftName, missing.map((service) => SERVICE_LABEL[service]).join(", ")]);
        }
      }
    }
    return gaps;
  }

  /** An agent's report on their own work. */
  private async agentReport(range: Range, staffId: string) {
    const closed = await this.db.client.case.findMany({
      where: { agentId: staffId, closedAt: { gte: range.from, lt: range.to } },
      select: { outcome: true, rating: true, assignedAt: true, closedAt: true },
    });
    const handlingTimes = withoutNulls(closed.map((found) => minutesBetween(found.assignedAt, found.closedAt)));
    const ratings = withoutNulls(closed.map((found) => found.rating));

    return {
      title: "My work",
      tiles: [
        { label: "Cases closed", value: closed.length },
        { label: "Median handling time", value: round(median(handlingTimes)), unit: "min" as const },
        {
          label: "Average rating",
          value: round(average(ratings)),
          unit: "/5" as const,
          hint: ratings.length ? `${ratings.length} ratings` : undefined,
        },
      ],
      tables: [
        {
          title: "Outcomes",
          columns: ["Outcome", "Cases"],
          rows: Object.entries(OUTCOME_LABEL)
            .filter(([outcome]) => outcome !== "CANCELLED_BY_PATIENT")
            .map(([outcome, label]) => [label, closed.filter((found) => found.outcome === outcome).length]),
        },
        {
          title: "Ratings",
          columns: ["Stars", "Cases"],
          rows: [5, 4, 3, 2, 1].map((stars) => [`${stars}`, ratings.filter((rating) => rating === stars).length]),
        },
      ],
    };
  }

  /** A clinician's report on their own patients, visits and prescriptions. */
  private async clinicianReport(range: Range, staffId: string) {
    const inPeriod = { gte: range.from, lt: range.to };
    const [arrived, ended, prescriptions, entries] = await Promise.all([
      this.db.client.routing.findMany({
        where: { arrivedAt: inPeriod, OR: [{ clinicianId: staffId }, { arrivedById: staffId }] },
        select: { case: { select: { patientId: true } } },
      }),
      this.db.client.routing.findMany({
        where: { endedAt: inPeriod, clinicianId: staffId, arrivedAt: { not: null } },
        select: { status: true },
      }),
      this.db.client.prescription.count({ where: { prescriberId: staffId, createdAt: inPeriod } }),
      this.db.client.clinicalEntry.count({ where: { authorId: staffId, createdAt: inPeriod } }),
    ]);
    const endedAs = (status: string) => ended.filter((visit) => visit.status === status).length;

    return {
      title: "My patients",
      tiles: [
        { label: "Patients seen", value: new Set(arrived.map((visit) => visit.case.patientId)).size },
        { label: "Visits ended", value: ended.length },
        { label: "Prescriptions issued", value: prescriptions },
        { label: "Record entries written", value: entries },
      ],
      tables: [
        {
          title: "How visits ended",
          columns: ["", "Visits"],
          rows: [
            ["Discharged", endedAs("DISCHARGED")],
            ["Completed", endedAs("COMPLETED")],
            ["Transferred", endedAs("TRANSFERRED")],
          ],
        },
      ],
    };
  }
}

/** The same report as a CSV file to download: one row per number or table line. */
export function reportCsv(report: Report) {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return "";
    return `"${String(value).replace(/"/g, '""')}"`; // quotes inside a value are doubled
  };
  const asText = (value: string | number | null) => (value === null ? "" : String(value));

  const lines: string[][] = [
    [`${report.title}, ${report.start} to ${report.end} (end not included)`],
    [],
    ["Measure", "Value", "Unit", "Note"],
  ];
  for (const tile of report.tiles) {
    lines.push([tile.label, asText(tile.value), tile.unit ?? "", tile.hint ?? ""]);
  }
  for (const table of report.tables) {
    lines.push([], [table.title], table.columns);
    for (const row of table.rows) lines.push(row.map(asText));
  }

  // The byte order mark at the start makes Excel read the file as UTF-8.
  const byteOrderMark = "﻿";
  return byteOrderMark + lines.map((line) => line.map(cell).join(",")).join("\n") + "\n";
}
