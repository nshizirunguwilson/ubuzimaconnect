import { Controller, Get, Query } from "@nestjs/common";
import { currentShift } from "@ubuzima/shared";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { DbService } from "../common/db.service";
import { activityRows, newestFirst } from "./activity";

const PAGE = 50;

/** Staff activity: a facility manager sees their own staff's, the administrator sees everyone's. */
@Controller("activity")
@Auth({ kind: "staff", roles: ["ADMIN", "FACILITY_MANAGER"] })
export class StaffActivityController {
  constructor(private db: DbService) {}

  @Get()
  async list(
    @CurrentSession() session: LiveSession,
    @Query("staffId") staffId?: string,
    @Query("before") before?: string,
  ) {
    const me = session.staff!;
    const isAdmin = me.role === "ADMIN";

    // A manager sees the staff of their facility. A manager without a facility has nobody to see.
    let whoseStaff = {};
    if (!isAdmin) whoseStaff = me.facilityId ? { facilityId: me.facilityId } : { id: { in: [] } };
    const people = await this.db.client.staff.findMany({
      where: whoseStaff,
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    const visibleIds = people.map((person) => person.id);

    // One person when asked for (and visible); otherwise everyone the viewer may see.
    let whose = {};
    if (staffId && visibleIds.includes(staffId)) whose = { actorType: "staff", actorId: { in: [staffId] } };
    else if (!isAdmin) whose = { actorType: "staff", actorId: { in: visibleIds } };

    // One more than a page is loaded, to know whether there is a next page.
    const events = await newestFirst(this.db.client, whose, before, PAGE + 1);
    const rows = await activityRows(this.db.client, events.slice(0, PAGE));
    const hasNextPage = events.length > PAGE;
    return { people, rows, next: hasNextPage ? events[PAGE - 1].id : null };
  }
}

/** Every agent: whether they are scheduled now, their status and for how long. Scheduled but Offline stands out. */
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
      select: {
        id: true,
        name: true,
        agentStatus: true,
        agentStatusSince: true,
        shifts: { where: { date: new Date(`${date}T00:00:00Z`), shift }, select: { id: true } },
      },
    });

    const rows = agents.map((agent) => {
      const scheduled = agent.shifts.length > 0;
      return {
        id: agent.id,
        name: agent.name,
        scheduled,
        status: agent.agentStatus,
        since: agent.agentStatusSince,
        alert: scheduled && agent.agentStatus === "OFFLINE",
      };
    });

    // Alerts at the very top, then the scheduled agents, so the gaps are seen first.
    rows.sort((a, b) => {
      if (a.alert !== b.alert) return a.alert ? -1 : 1;
      if (a.scheduled !== b.scheduled) return a.scheduled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { shift, date, rows };
  }
}
