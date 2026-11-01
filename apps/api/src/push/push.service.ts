import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PUSH_TEXT, PUSH_TEXT_RW } from "@ubuzima/shared";
import type { Subscription as RxSubscription } from "rxjs";
import webpush from "web-push";
import { DbService } from "../common/db.service";
import { env } from "../common/env";
import { EventsService } from "../live/events.service";

/** An hour: a notification older than that isn't worth delivering. */
const NOTIFICATION_TTL_SECONDS = 3600;

type Subscription = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Web Push, for people who don't have the app open. It listens to the live events instead of being called
 * from every place a message is made:
 * - a message from the agent or the system on a case goes to the patient who opened the case;
 * - a patient given or handed over to a clinician goes to that clinician.
 * The text is always "You have a new message." (in Kinyarwanda for patients who chose it), never anything
 * medical. Only the link differs.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Push");
  private listening?: RxSubscription;

  constructor(
    private db: DbService,
    private events: EventsService,
  ) {}

  get publicKey() {
    return env.vapid?.publicKey ?? null;
  }

  onModuleInit() {
    if (!env.vapid) {
      this.log.warn("VAPID keys not set: no push notifications will be sent");
      return;
    }
    webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);

    this.listening = this.events.all().subscribe(({ channel, event }) => {
      const isCaseMessageForPatient = event.type === "message" && event.message.sender !== "PATIENT" && channel.startsWith("case:");
      if (isCaseMessageForPatient) void this.notifyPatientOfCase(event.caseId);

      if (event.type === "notice" && channel.startsWith("staff:")) {
        void this.notifyStaff(channel.slice("staff:".length));
      }
    });
  }

  onModuleDestroy() {
    this.listening?.unsubscribe();
  }

  private async notifyPatientOfCase(caseId: string) {
    const found = await this.db.client.case.findUnique({
      where: { id: caseId },
      select: { openedById: true, openedBy: { select: { lang: true } } },
    });
    if (!found || this.events.isWatching(`patient:${found.openedById}`)) return;

    const text = found.openedBy.lang === "rw" ? PUSH_TEXT_RW : PUSH_TEXT;
    const subscriptions = await this.db.client.pushSubscription.findMany({ where: { patientId: found.openedById } });
    await this.send(subscriptions, `/cases/${caseId}`, text);
  }

  private async notifyStaff(staffId: string) {
    if (this.events.isWatching(`staff:${staffId}`)) return;
    const subscriptions = await this.db.client.pushSubscription.findMany({ where: { staffId } });
    await this.send(subscriptions, "/staff/patients", PUSH_TEXT);
  }

  private async send(subscriptions: Subscription[], url: string, text: { title: string; body: string }) {
    for (const subscription of subscriptions) {
      // web-push encrypts and signs the message (RFC 8291 and VAPID); fetch sends it,
      // so the same code works with any browser's push service.
      const request = webpush.generateRequestDetails(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ ...text, url }),
        { TTL: NOTIFICATION_TTL_SECONDS, urgency: "high" },
      );
      const response = await fetch(request.endpoint, {
        method: request.method,
        headers: request.headers as Record<string, string>,
        body: new Uint8Array(request.body as Buffer),
      }).catch(() => null);

      if (response?.ok) {
        await this.db.client.pushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } });
      } else if (response?.status === 404 || response?.status === 410) {
        // The browser unsubscribed or was reset: forget it.
        await this.db.client.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => null);
      } else {
        this.log.warn(`Push failed (${response?.status ?? "network"})`);
      }
    }
  }
}
