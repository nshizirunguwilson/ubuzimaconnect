import { Controller, MessageEvent, Param, ParseUUIDPipe, Sse } from "@nestjs/common";
import { defer, filter, finalize, interval, map, merge, Observable, tap } from "rxjs";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { EventsService } from "./events.service";

const PING_MS = 15_000;

/**
 * Server-Sent Events, opened by the browser straight to the API with the session cookie
 * (DECISIONS.md D34). A ping every 15 s keeps proxies from closing the stream.
 */
@Controller("events")
export class EventsController {
  constructor(
    private events: EventsService,
    private db: DbService,
  ) {}

  /** The patient (or parent) of a case, or the agent handling it. */
  @Sse("cases/:id")
  @Auth({ kind: "any" })
  async caseStream(@Param("id", ParseUUIDPipe) id: string, @CurrentSession() s: LiveSession): Promise<Observable<MessageEvent>> {
    const c = await this.db.client.case.findUnique({ where: { id }, select: { patientId: true, agentId: true } });
    if (!c) throw new ApiException(404, "NOT_FOUND", "Not found");
    let allowed = false;
    if (s.staff) allowed = c.agentId === s.staffId;
    else if (s.patientId === c.patientId) allowed = true;
    else if (s.patientId) {
      allowed = !!(await this.db.client.familyLink.findUnique({ where: { guardianId_dependantId: { guardianId: s.patientId, dependantId: c.patientId } } }));
    }
    if (!allowed) throw new ApiException(403, "FORBIDDEN", "You don't have access to this.");
    // While a patient has a case open, they read new messages there; no push needed (FR 6.6).
    const who = s.patientId ? `patient:${s.patientId}` : `staff:${s.staffId}`;
    return this.watched(who, this.withPing(this.events.stream([`case:${id}`])));
  }

  /**
   * An agent's own stream: offers and queue changes. While it is open the agent counts as connected;
   * 60 s without it makes them Offline (FR 6.14).
   */
  @Sse("agent")
  @Auth({ kind: "staff", roles: ["AGENT"] })
  agentStream(@CurrentSession() s: LiveSession): Observable<MessageEvent> {
    const staffId = s.staffId!;
    const seen = () => void this.db.client.staff.update({ where: { id: staffId }, data: { lastSeenAt: new Date() } }).catch(() => null);
    seen();
    // Marks the agent as connected every 15 s while the stream is open; sends nothing itself.
    const heartbeat = interval(PING_MS).pipe(tap(seen), filter(() => false));
    return this.withPing(merge(this.events.stream([`agent:${staffId}`, "agents"]), heartbeat));
  }

  /**
   * A clinician's stream: their facility's incoming list changed, or a patient was given to them (FR 7.4, 5.12, 7.11).
   * An administrator's stream: alerts (FR 12.7).
   */
  @Sse("staff")
  @Auth({ kind: "staff", roles: ["CLINICIAN", "ADMIN"] })
  staffStream(@CurrentSession() s: LiveSession): Observable<MessageEvent> {
    const channels = s.staff!.role === "ADMIN" ? ["admins"] : [`staff:${s.staffId}`];
    if (s.staff!.role === "CLINICIAN" && s.staff!.facilityId) channels.push(`facility:${s.staff!.facilityId}`);
    return this.watched(`staff:${s.staffId}`, this.withPing(this.events.stream(channels)));
  }

  /** Counts the person as having the app open for as long as this stream is open. */
  private watched(key: string, source: Observable<MessageEvent>): Observable<MessageEvent> {
    return defer(() => {
      this.events.watch(key);
      return source.pipe(finalize(() => this.events.unwatch(key)));
    });
  }

  private withPing(source: Observable<unknown>): Observable<MessageEvent> {
    return merge(
      source.pipe(map((data) => ({ data }) as MessageEvent)),
      interval(PING_MS).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent)),
    );
  }
}
