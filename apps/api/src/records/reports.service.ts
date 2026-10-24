import { Injectable } from "@nestjs/common";
import { OUTCOME_LABEL, periodRange, SERVICE_LABEL, SHIFTS, type Period, type Service } from "@ubuzima/shared";
import { DbService } from "../common/db.service";
import { bedUsage } from "../setup/beds";

/** One number at the top of a report. `value` null means "no data in this period", shown as a dash, never 0. */
export type Tile = { label: string; value: number | null; unit?: "min" | "%" | "days" | "/5"; hint?: string };
export type Table = { title: string; columns: string[]; rows: (string | number | null)[][] };
export type Report = { title: string; period: Period; start: string; end: string; tiles: Tile[]; tables: Table[] };

const MIN = 60_000;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.9) - 1] : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v: number | null, digits = 1) => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);
const minutes = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / MIN : null);
const present = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);

/**
 * FR 12.8: each role's report for one day, week or month. Everything is counted from the records the app
 * already keeps (cases, routings, the audit log), so a report can never disagree with what happened.
 */
@Injectable()
export class ReportsService {
  constructor(private db: DbService) {}

  async build(role: string, staffId: string, facilityId: string | null, period: Period, anchor: string): Promise<Report> {
    const r = periodRange(period, anchor);
    const base = { period, start: r.start, end: r.end };
    if (role === "ADMIN") return { ...base, ...(await this.admin(r)) };
    if (role === "FACILITY_MANAGER") return { ...base, ...(await this.facility(r, facilityId!)) };
    if (role === "AGENT") return { ...base, ...(await this.agent(r, staffId)) };
    return { ...base, ...(await this.clinician(r, staffId)) };
  }

  /** FR 12.8, administrators. */
  private async admin(r: ReturnType<typeof periodRange>) {
    const inPeriod = { gte: r.from, lt: r.to };
    const [created, closed, accepted, events] = await Promise.all([
      this.db.client.case.findMany({ where: { createdAt: inPeriod }, select: { triageLevel: true } }),
      this.db.client.case.findMany({ where: { closedAt: inPeriod }, select: { triageLevel: true, outcome: true, rating: true, agentId: true, assignedAt: true, closedAt: true } }),
      this.db.client.case.findMany({ where: { assignedAt: inPeriod, queuedAt: { not: null } }, select: { queuedAt: true, assignedAt: true } }),
      this.db.client.auditEvent.groupBy({
        by: ["action"],
        where: { createdAt: inPeriod, action: { in: ["case.delay_incident", "routing.no_beds", "routing.no_match", "routing.expired", "bed.released", "ai.failure"] } },
        _count: true,
      }),
    ]);
    const count = (a: string) => events.find((e) => e.action === a)?._count ?? 0;
    const waits = present(accepted.map((c) => minutes(c.queuedAt, c.assignedAt)));
    const minor = closed.filter((c) => c.triageLevel === "MINOR" && c.outcome !== "CANCELLED_BY_PATIENT");
    const remote = minor.filter((c) => c.outcome === "ADVISED_REMOTELY" || c.outcome === "PRESCRIPTION_ISSUED");
    const ratings = present(closed.map((c) => c.rating));

    const agents = await this.db.client.staff.findMany({ where: { role: "AGENT" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const agentRows = agents.map((a) => {
      const mine = closed.filter((c) => c.agentId === a.id);
      return [a.name, mine.length, round(median(present(mine.map((c) => minutes(c.assignedAt, c.closedAt))))), round(avg(present(mine.map((c) => c.rating))))];
    });

    // Scheduled versus online, per day: scheduled = had a shift that day; online = changed status or took a case that day.
    const [shifts, seen] = await Promise.all([
      this.db.client.shiftAssignment.findMany({ where: { date: { gte: new Date(`${r.start}T00:00:00Z`), lt: new Date(`${r.end}T00:00:00Z`) }, staff: { role: "AGENT" }, unavailable: false }, select: { staffId: true, date: true } }),
      this.db.client.auditEvent.findMany({ where: { createdAt: inPeriod, action: { in: ["agent.status", "case.accepted"] }, actorType: "staff" }, select: { actorId: true, createdAt: true } }),
    ]);
    const kigaliDay = (d: Date) => new Date(d.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
    const staffing = r.days.map((day) => {
      const scheduled = new Set(shifts.filter((s) => s.date.toISOString().slice(0, 10) === day).map((s) => s.staffId));
      const online = new Set(seen.filter((e) => kigaliDay(e.createdAt) === day).map((e) => e.actorId));
      return [day, scheduled.size, [...scheduled].filter((id) => online.has(id)).length];
    });

    const levels = ["URGENT", "UNCERTAIN", "MINOR"] as const;
    return {
      title: "Service report",
      tiles: [
        { label: "Requests", value: created.length },
        { label: "Median wait for an agent", value: round(median(waits)), unit: "min" as const, hint: waits.length ? `90% within ${round(p90(waits))} min` : undefined },
        { label: "Delay incidents", value: count("case.delay_incident"), hint: "Waited more than 5 minutes" },
        { label: "Minor cases closed without travel", value: minor.length ? Math.round((remote.length / minor.length) * 100) : null, unit: "%" as const },
        { label: "Average rating", value: round(avg(ratings)), unit: "/5" as const, hint: ratings.length ? `${ratings.length} ratings` : undefined },
        { label: "AI failures", value: count("ai.failure") },
      ],
      tables: [
        { title: "Requests by triage level", columns: ["Level", "Requests"], rows: [...levels.map((l) => [l[0] + l.slice(1).toLowerCase(), created.filter((c) => c.triageLevel === l).length]), ["Not finished", created.filter((c) => !c.triageLevel).length]] },
        {
          title: "Closed requests by outcome",
          columns: ["Outcome", "Requests"],
          rows: Object.entries(OUTCOME_LABEL).map(([k, label]) => [label, closed.filter((c) => c.outcome === k).length]),
        },
        {
          title: "Capacity and timers",
          columns: ["Event", "Count"],
          rows: [
            ["No free bed nearby", count("routing.no_beds")],
            ["No facility could take the case", count("routing.no_match")],
            ["Routings expired (no arrival in 24 h)", count("routing.expired")],
            ["Bed reservations released", count("bed.released")],
          ],
        },
        { title: "Agent performance", columns: ["Agent", "Cases closed", "Median handling (min)", "Average rating"], rows: agentRows },
        { title: "Scheduled and online agents", columns: ["Day", "Scheduled", "Of them online"], rows: staffing },
      ],
    };
  }

  /** FR 12.8, facility managers: their own facility only (FR 9.4). */
  private async facility(r: ReturnType<typeof periodRange>, facilityId: string) {
    const inPeriod = { gte: r.from, lt: r.to };
    const [f, sent, arrived, ended, expired] = await Promise.all([
      this.db.client.facility.findUniqueOrThrow({ where: { id: facilityId } }),
      this.db.client.routing.findMany({ where: { facilityId, createdAt: inPeriod, status: { notIn: ["CHANGED", "CANCELLED"] } }, select: { caseId: true } }),
      this.db.client.routing.findMany({ where: { facilityId, arrivedAt: inPeriod }, select: { reservation: { select: { status: true } } } }),
      this.db.client.routing.findMany({ where: { facilityId, endedAt: inPeriod, arrivedAt: { not: null } }, select: { status: true, arrivedAt: true, endedAt: true } }),
      this.db.client.routing.count({ where: { facilityId, status: "EXPIRED", endedAt: inPeriod } }),
    ]);
    const u = await bedUsage(this.db.client, facilityId);
    const stays = present(ended.filter((e) => e.status !== "TRANSFERRED").map((e) => minutes(e.arrivedAt, e.endedAt)));

    // Shift coverage: every shift in the period where a service the facility offers had no clinician on duty (FR 8.4).
    const clinicians = await this.db.client.staff.findMany({ where: { facilityId, role: "CLINICIAN", status: { not: "DEACTIVATED" } }, select: { id: true, specialty: true } });
    const shifts = await this.db.client.shiftAssignment.findMany({
      where: { staffId: { in: clinicians.map((c) => c.id) }, date: { gte: new Date(`${r.start}T00:00:00Z`), lt: new Date(`${r.end}T00:00:00Z`) }, unavailable: false },
      select: { staffId: true, date: true, shift: true },
    });
    const gaps = r.days.flatMap((day) =>
      SHIFTS.flatMap((shift) => {
        const on = shifts.filter((s) => s.date.toISOString().slice(0, 10) === day && s.shift === shift).map((s) => clinicians.find((c) => c.id === s.staffId)?.specialty);
        const missing = (f.services as Service[]).filter((svc) => !on.includes(svc));
        return missing.length ? [[day, shift === "DAY" ? "Day" : "Night", missing.map((m) => SERVICE_LABEL[m]).join(", ")]] : [];
      }),
    );

    return {
      title: `${f.name}: facility report`,
      tiles: [
        { label: "Patients sent here", value: new Set(sent.map((s) => s.caseId)).size },
        { label: "Arrived", value: arrived.length },
        { label: "Did not come", value: expired, hint: "Routing expired after 24 hours" },
        { label: "Beds in use now", value: f.totalBeds ? Math.round(((u.occupied + u.reserved) / f.totalBeds) * 100) : null, unit: "%" as const, hint: `${u.occupied} occupied, ${u.reserved} held, of ${f.totalBeds}` },
        { label: "Average length of stay", value: round(avg(stays) === null ? null : avg(stays)! / (60 * 24), 1), unit: "days" as const },
        { label: "Shifts with a gap", value: gaps.length, hint: "A service offered with no clinician on duty" },
      ],
      tables: [
        {
          title: "Movements",
          columns: ["", "Patients"],
          rows: [
            ["Admitted (given a bed)", arrived.filter((a) => a.reservation?.status === "USED").length],
            ["Seen without a bed", arrived.filter((a) => a.reservation?.status !== "USED").length],
            ["Discharged", ended.filter((e) => e.status === "DISCHARGED").length],
            ["Visits completed", ended.filter((e) => e.status === "COMPLETED").length],
            ["Transferred out", ended.filter((e) => e.status === "TRANSFERRED").length],
          ],
        },
        { title: "Shift coverage gaps", columns: ["Day", "Shift", "Missing"], rows: gaps },
      ],
    };
  }

  /** FR 12.8, agents: their own work. */
  private async agent(r: ReturnType<typeof periodRange>, staffId: string) {
    const closed = await this.db.client.case.findMany({ where: { agentId: staffId, closedAt: { gte: r.from, lt: r.to } }, select: { outcome: true, rating: true, assignedAt: true, closedAt: true } });
    const handling = present(closed.map((c) => minutes(c.assignedAt, c.closedAt)));
    const ratings = present(closed.map((c) => c.rating));
    return {
      title: "My work",
      tiles: [
        { label: "Cases closed", value: closed.length },
        { label: "Median handling time", value: round(median(handling)), unit: "min" as const },
        { label: "Average rating", value: round(avg(ratings)), unit: "/5" as const, hint: ratings.length ? `${ratings.length} ratings` : undefined },
      ],
      tables: [
        {
          title: "Outcomes",
          columns: ["Outcome", "Cases"],
          rows: Object.entries(OUTCOME_LABEL)
            .filter(([k]) => k !== "CANCELLED_BY_PATIENT")
            .map(([k, label]) => [label, closed.filter((c) => c.outcome === k).length]),
        },
        { title: "Ratings", columns: ["Stars", "Cases"], rows: [5, 4, 3, 2, 1].map((n) => [`${n}`, ratings.filter((x) => x === n).length]) },
      ],
    };
  }

  /** FR 12.8, clinicians: their own patients, visits and prescriptions. */
  private async clinician(r: ReturnType<typeof periodRange>, staffId: string) {
    const inPeriod = { gte: r.from, lt: r.to };
    const [arrived, ended, prescriptions, entries] = await Promise.all([
      this.db.client.routing.findMany({ where: { arrivedAt: inPeriod, OR: [{ clinicianId: staffId }, { arrivedById: staffId }] }, select: { case: { select: { patientId: true } } } }),
      this.db.client.routing.findMany({ where: { endedAt: inPeriod, clinicianId: staffId, arrivedAt: { not: null } }, select: { status: true } }),
      this.db.client.prescription.count({ where: { prescriberId: staffId, createdAt: inPeriod } }),
      this.db.client.clinicalEntry.count({ where: { authorId: staffId, createdAt: inPeriod } }),
    ]);
    return {
      title: "My patients",
      tiles: [
        { label: "Patients seen", value: new Set(arrived.map((a) => a.case.patientId)).size },
        { label: "Visits ended", value: ended.length },
        { label: "Prescriptions issued", value: prescriptions },
        { label: "Record entries written", value: entries },
      ],
      tables: [
        {
          title: "How visits ended",
          columns: ["", "Visits"],
          rows: [
            ["Discharged", ended.filter((e) => e.status === "DISCHARGED").length],
            ["Completed", ended.filter((e) => e.status === "COMPLETED").length],
            ["Transferred", ended.filter((e) => e.status === "TRANSFERRED").length],
          ],
        },
      ],
    };
  }
}

/** FR 12.8 "downloaded": the same report as CSV, one row per number or table line. */
export function reportCsv(rep: Report) {
  const cell = (v: unknown) => (v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const lines = [[`${rep.title}, ${rep.start} to ${rep.end} (end not included)`], [], ["Measure", "Value", "Unit", "Note"]];
  for (const t of rep.tiles) lines.push([t.label, t.value === null ? "" : String(t.value), t.unit ?? "", t.hint ?? ""]);
  for (const t of rep.tables) {
    lines.push([], [t.title], t.columns);
    for (const row of t.rows) lines.push(row.map((v) => (v === null ? "" : String(v))));
  }
  return "﻿" + lines.map((l) => l.map(cell).join(",")).join("\n") + "\n";
}
