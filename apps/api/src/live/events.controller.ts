import { Controller, MessageEvent, Param, ParseUUIDPipe, Sse } from "@nestjs/common";
import { defer, filter, finalize, interval, map, merge, Observable, tap } from "rxjs";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { EventsService } from "./events.service";

/** A ping this often keeps proxies from closing a quiet stream. Agents are also marked as connected this often. */
const PING_MS = 15_000;

/**
 * Live streams (Server-Sent Events). The browser opens them straight to the API with its session cookie.
 */
@Controller("events")
export class EventsController {
  constructor(
    private events: EventsService,
    private db: DbService,
  ) {}

  /** Updates on one case, for its patient (or the parent of a child patient) and the agent handling it. */
  @Sse("cases/:id")
  @Auth({ kind: "any" })
  async caseStream(
    @Param("id", ParseUUIDPipe) caseId: string,
    @CurrentSession() session: LiveSession,
  ): Promise<Observable<MessageEvent>> {
    const found = await this.db.client.case.findUnique({
      where: { id: caseId },
      select: { patientId: true, agentId: true },
    });
    if (!found) throw new ApiException(404, "NOT_FOUND", "Not found");

    const allowed = await this.mayFollowCase(session, found);
    if (!allowed) throw new ApiException(403, "FORBIDDEN", "You don't have access to this.");

    // While a patient has their case open they read new messages there, so they get no push notification.
    const viewer = session.patientId ? `patient:${session.patientId}` : `staff:${session.staffId}`;
    return this.countAsWatching(viewer, this.withPing(this.events.stream([`case:${caseId}`])));
  }

  /**
   * An agent's own stream: offers and queue changes. While it is open the agent counts as connected;
   * after 60 seconds without it they become Offline.
   */
  @Sse("agent")
  @Auth({ kind: "staff", roles: ["AGENT"] })
  agentStream(@CurrentSession() session: LiveSession): Observable<MessageEvent> {
    const staffId = session.staffId!;
    const markSeen = () => {
      void this.db.client.staff.update({ where: { id: staffId }, data: { lastSeenAt: new Date() } }).catch(() => null);
    };
    markSeen();

    // Marks the agent as seen every 15 seconds while the stream is open. It sends nothing to the browser.
    const heartbeat = interval(PING_MS).pipe(
      tap(markSeen),
      filter(() => false),
    );
    const updates = this.events.stream([`agent:${staffId}`, "agents"]);
    return this.withPing(merge(updates, heartbeat));
  }

  /**
   * A clinician's stream: their facility's list of incoming patients changed, or a patient was given to them.
   * An administrator's stream: alerts.
   */
  @Sse("staff")
  @Auth({ kind: "staff", roles: ["CLINICIAN", "ADMIN"] })
  staffStream(@CurrentSession() session: LiveSession): Observable<MessageEvent> {
    const staff = session.staff!;
    const channels = staff.role === "ADMIN" ? ["admins"] : [`staff:${session.staffId}`];
    if (staff.role === "CLINICIAN" && staff.facilityId) {
      channels.push(`facility:${staff.facilityId}`);
    }
    return this.countAsWatching(`staff:${session.staffId}`, this.withPing(this.events.stream(channels)));
  }

  /** The case's agent, the patient themself, or a parent linked to the patient. */
  private async mayFollowCase(session: LiveSession, found: { patientId: string; agentId: string | null }) {
    if (session.staff) return found.agentId === session.staffId;
    if (session.patientId === found.patientId) return true;
    if (!session.patientId) return false;

    const parentLink = await this.db.client.familyLink.findUnique({
      where: { guardianId_dependantId: { guardianId: session.patientId, dependantId: found.patientId } },
    });
    return parentLink !== null;
  }

  /** Counts the person as having the app open for as long as this stream is open. */
  private countAsWatching(key: string, source: Observable<MessageEvent>): Observable<MessageEvent> {
    return defer(() => {
      this.events.watch(key);
      return source.pipe(finalize(() => this.events.unwatch(key)));
    });
  }

  private withPing(source: Observable<unknown>): Observable<MessageEvent> {
    const updates = source.pipe(map((data) => ({ data }) as MessageEvent));
    const pings = interval(PING_MS).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, pings);
  }
}
