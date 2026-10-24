import { Injectable } from "@nestjs/common";
import type { LiveEvent } from "@ubuzima/shared";
import { Subject, filter, map, type Observable } from "rxjs";

/**
 * In-process event bus for live updates. Channels: `case:<id>`, `agent:<staffId>`, `agents`,
 * `staff:<staffId>` and `facility:<facilityId>`.
 * One API instance in the pilot; with more instances this becomes Postgres LISTEN/NOTIFY (DECISIONS.md D34).
 */
@Injectable()
export class EventsService {
  private bus = new Subject<{ channel: string; event: LiveEvent }>();

  emit(channel: string, event: LiveEvent) {
    this.bus.next({ channel, event });
  }

  /** Every event with its channel, for listeners that act on many channels (push notifications). */
  all(): Observable<{ channel: string; event: LiveEvent }> {
    return this.bus.asObservable();
  }

  // Who has the app open right now, so push is only sent to people who don't (FR 6.6).
  private watching = new Map<string, number>();
  watch(key: string) {
    this.watching.set(key, (this.watching.get(key) ?? 0) + 1);
  }
  unwatch(key: string) {
    const n = (this.watching.get(key) ?? 1) - 1;
    if (n > 0) this.watching.set(key, n);
    else this.watching.delete(key);
  }
  isWatching(key: string) {
    return this.watching.has(key);
  }

  stream(channels: string[]): Observable<LiveEvent> {
    const set = new Set(channels);
    return this.bus.pipe(
      filter((m) => set.has(m.channel)),
      map((m) => m.event),
    );
  }
}
