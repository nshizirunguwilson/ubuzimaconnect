import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PUSH_TEXT, PUSH_TEXT_RW } from "@ubuzima/shared";
import type { Subscription } from "rxjs";
import webpush from "web-push";
import { DbService } from "../common/db.service";
import { env } from "../common/env";
import { EventsService } from "../live/events.service";

/**
 * FR 6.6, 5.12, 7.11: Web Push to people who don't have the app open.
 * It listens to the live event bus instead of being called from every place a message is made:
 * - a message from the agent or the system in a case → the patient who opened the case;
 * - a patient given or handed over to a clinician → that clinician.
 * NFR 13: the text is always "You have a new message." (in Kinyarwanda for patients who chose it); only the link differs.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger("Push");
  private sub?: Subscription;

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
    this.sub = this.events.all().subscribe(({ channel, event }) => {
      if (event.type === "message" && event.message.sender !== "PATIENT" && channel.startsWith("case:")) void this.toCase(event.caseId);
      if (event.type === "notice" && channel.startsWith("staff:")) void this.toStaff(channel.slice(6));
    });
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }

  private async toCase(caseId: string) {
    const c = await this.db.client.case.findUnique({ where: { id: caseId }, select: { openedById: true, openedBy: { select: { lang: true } } } });
    if (!c || this.events.isWatching(`patient:${c.openedById}`)) return;
    const text = c.openedBy.lang === "rw" ? PUSH_TEXT_RW : PUSH_TEXT;
    await this.send(await this.db.client.pushSubscription.findMany({ where: { patientId: c.openedById } }), `/cases/${caseId}`, text);
  }

  private async toStaff(staffId: string) {
    if (this.events.isWatching(`staff:${staffId}`)) return;
    await this.send(await this.db.client.pushSubscription.findMany({ where: { staffId } }), "/staff/patients", PUSH_TEXT);
  }

  private async send(subs: { id: string; endpoint: string; p256dh: string; auth: string }[], url: string, text: { title: string; body: string }) {
    for (const s of subs) {
      // web-push encrypts and signs (RFC 8291, VAPID); fetch sends it, so the same code works for any push service.
      const req = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...text, url }), {
        TTL: 3600,
        urgency: "high",
      });
      const res = await fetch(req.endpoint, { method: req.method, headers: req.headers as Record<string, string>, body: new Uint8Array(req.body as Buffer) }).catch(() => null);
      if (res?.ok) await this.db.client.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
      // 404 and 410: the browser unsubscribed or was reset; forget it.
      else if (res?.status === 404 || res?.status === 410) await this.db.client.pushSubscription.delete({ where: { id: s.id } }).catch(() => null);
      else this.log.warn(`Push failed (${res?.status ?? "network"})`);
    }
  }
}
