import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { LiveEvent } from "@ubuzima/shared";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Subject, filter, map, type Observable } from "rxjs";

/** One Postgres channel carries every live event between API servers. */
const PG_CHANNEL = "uc_live";
/** Postgres refuses NOTIFY payloads of 8000 bytes or more. */
const MAX_PAYLOAD = 7900;

type Message = { channel: string; event: LiveEvent };

/**
 * Live updates. Channels: `case:<id>`, `agent:<staffId>`, `agents`, `admins`, `staff:<staffId>` and `facility:<facilityId>`.
 *
 * An event is delivered at once to the browsers connected to this server, and sent through Postgres NOTIFY to the
 * other servers, which deliver it to theirs. So a patient on one server and an agent on another see each other's
 * messages, and servers can be added behind Azure's load balancer with no code change.
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
    client.on("error", (error) => {
      this.log.warn(`Listener lost: ${error.message}`);
      retry();
    });
    client.on("end", retry);
    client.on("notification", (notification) => {
      if (notification.channel !== PG_CHANNEL || !notification.payload) return;
      try {
        const message = JSON.parse(notification.payload) as Message & { origin: string };
        const sentByThisServer = message.origin === this.origin; // already delivered locally in emit()
        if (!sentByThisServer) {
          this.bus.next({ channel: message.channel, event: message.event, local: false });
        }
      } catch {
        // Not one of our messages: ignore it.
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
      this.listener = client;
    } catch (error) {
      this.log.warn(`Listener could not connect: ${(error as Error).message}`);
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
    this.publisher
      .query("select pg_notify($1, $2)", [PG_CHANNEL, payload])
      .catch((error) => this.log.warn(`Notify failed: ${error.message}`));
  }

  /** Events raised on this server only, for work that must happen once, such as push notifications. */
  all(): Observable<Message> {
    return this.bus.pipe(
      filter((message) => message.local),
      map(({ channel, event }) => ({ channel, event })),
    );
  }

  // Who has the app open on this server, so push notifications go only to people who don't.
  private watching = new Map<string, number>();
  watch(key: string) {
    this.watching.set(key, (this.watching.get(key) ?? 0) + 1);
  }
  unwatch(key: string) {
    const openStreams = (this.watching.get(key) ?? 1) - 1;
    if (openStreams > 0) this.watching.set(key, openStreams);
    else this.watching.delete(key);
  }
  isWatching(key: string) {
    return this.watching.has(key);
  }

  /** Events from every server on these channels, for a browser's stream. */
  stream(channels: string[]): Observable<LiveEvent> {
    const wanted = new Set(channels);
    return this.bus.pipe(
      filter((message) => wanted.has(message.channel)),
      map((message) => message.event),
    );
  }
}
