import { Controller, Get, Query } from "@nestjs/common";
import { currentShift } from "@ubuzima/shared";
import { DbService } from "../common/db.service";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { activityRows } from "./activity";

const PAGE = 50;

/** FR 10.3: facility managers see their own staff's activity; administrators see everyone's. */
@Controller("activity")
@Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
export class StaffActivityController {
  constructor(private db: DbService) {}

  @Get()
  async list(@CurrentSession() s: LiveSession, @Query("staffId") staffId?: string, @Query("before") before?: string) {
    const admin = s.staff!.role === "ADMIN";
    const people = await this.db.client.staff.findMany({
      // A manager without a facility has no staff to see.
      where: admin ? {} : s.staff!.facilityId ? { facilityId: s.staff!.facilityId } : { id: { in: [] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    const ids = people.map((p) => p.id);
    const who = staffId && ids.includes(staffId) ? [staffId] : null;
    const events = await this.db.client.auditEvent.findMany({
      where: {
        ...(who ? { actorType: "staff", actorId: { in: who } } : admin ? {} : { actorType: "staff", actorId: { in: ids } }),
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: "desc" },
      take: PAGE + 1,
    });
    return { people, rows: await activityRows(this.db.client, events.slice(0, PAGE)), next: events.length > PAGE ? events[PAGE - 1].id : null };
  }
}

/** FR 12.5: every agent, whether they are scheduled now, their status and for how long; scheduled but Offline stands out. */
@Controller("on-duty")
@Auth({ kind: "staff", roles: ["ADMIN"] })
export class OnDutyController {
  constructor(private db: DbService) {}

  @Get()
  async agents() {
    const { date, shift } = currentShift();
    const agents = await this.db.client.staff.findMany({
      where: { role: "AGENT", status: { not: "DEACTIVATED" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, agentStatus: true, agentStatusSince: true, shifts: { where: { date: new Date(`${date}T00:00:00Z`), shift }, select: { id: true } } },
    });
    const rows = agents.map((a) => ({
      id: a.id,
      name: a.name,
      scheduled: a.shifts.length > 0,
      status: a.agentStatus,
      since: a.agentStatusSince,
      alert: a.shifts.length > 0 && a.agentStatus === "OFFLINE",
    }));
    // Scheduled first, alerts at the very top, so the gaps are seen first.
    rows.sort((x, y) => Number(y.alert) - Number(x.alert) || Number(y.scheduled) - Number(x.scheduled) || x.name.localeCompare(y.name));
    return { shift, date, rows };
  }
}
