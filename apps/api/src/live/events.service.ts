import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { LiveEvent } from "@ubuzima/shared";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Subject, filter, map, type Observable } from "rxjs";

/** One Postgres channel carries every live event between API instances (DECISIONS.md D70, NFR 5). */
const PG_CHANNEL = "uc_live";
/** Postgres refuses NOTIFY payloads of 8000 bytes or more. */
const MAX_PAYLOAD = 7900;

type Message = { channel: string; event: LiveEvent };

/**
 * Live updates. Channels: `case:<id>`, `agent:<staffId>`, `agents`, `staff:<staffId>` and `facility:<facilityId>`.
 *
 * An event is delivered at once to the browsers connected to this instance, and sent through Postgres NOTIFY to the
 * other instances, which deliver it to theirs. So a patient on one instance and an agent on another see each other's
 * messages, and instances can be added behind Azure's load balancer with no code change (NFR 5).
 */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Events");
  private readonly origin = randomUUID();
  private bus = new Subject<Message & { local: boolean }>();
  private listener?: pg.Client;
  private publisher?: pg.Pool;
  private stopped = false;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) return;
    this.publisher = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    await this.listen();
  }

  async onModuleDestroy() {
    this.stopped = true;
    await this.listener?.end().catch(() => null);
    await this.publisher?.end().catch(() => null);
  }

  /** A dedicated connection for LISTEN. If it drops, it reconnects: events sent meanwhile were already delivered locally. */
  private async listen() {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const retry = () => {
      if (this.stopped || this.listener !== client) return;
      this.listener = undefined;
      setTimeout(() => void this.listen(), 2000);
    };
    client.on("error", (e) => {
      this.log.warn(`Listener lost: ${e.message}`);
      retry();
    });
    client.on("end", retry);
    client.on("notification", (n) => {
      if (n.channel !== PG_CHANNEL || !n.payload) return;
      try {
        const m = JSON.parse(n.payload) as Message & { origin: string };
        if (m.origin !== this.origin) this.bus.next({ channel: m.channel, event: m.event, local: false });
      } catch {
        /* not ours */
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
      this.listener = client;
    } catch (e) {
      this.log.warn(`Listener could not connect: ${(e as Error).message}`);
      this.listener = client;
      retry();
    }
  }

  emit(channel: string, event: LiveEvent) {
    this.bus.next({ channel, event, local: true });
    if (!this.publisher) return;
    let payload = JSON.stringify({ origin: this.origin, channel, event });
    // A very long chat message: the other instances get a "case changed" event, and their browsers reload the case.
    if (Buffer.byteLength(payload) >= MAX_PAYLOAD && "caseId" in event) {
      payload = JSON.stringify({ origin: this.origin, channel, event: { type: "case", caseId: event.caseId } });
    }
    this.publisher.query("select pg_notify($1, $2)", [PG_CHANNEL, payload]).catch((e) => this.log.warn(`Notify failed: ${e.message}`));
  }

  /** Events raised on this instance, for work that must happen once (push notifications). */
  all(): Observable<Message> {
    return this.bus.pipe(
      filter((m) => m.local),
      map(({ channel, event }) => ({ channel, event })),
    );
  }

  // Who has the app open on this instance, so push is only sent to people who don't (FR 6.6).
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

  /** Events from every instance on these channels, for a browser's stream. */
  stream(channels: string[]): Observable<LiveEvent> {
    const set = new Set(channels);
    return this.bus.pipe(
      filter((m) => set.has(m.channel)),
      map((m) => m.event),
    );
  }
}
