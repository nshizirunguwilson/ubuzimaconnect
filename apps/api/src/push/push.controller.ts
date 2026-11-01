import { Body, Controller, Delete, Get, HttpCode, Post, Req } from "@nestjs/common";
import { pushSubscription } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { deviceType } from "../common/device";
import { ApiException } from "../common/errors";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { PushService } from "./push.service";

/** Turning push notifications on and off for this browser. */
@Controller("push")
export class PushController {
  constructor(
    private db: DbService,
    private push: PushService,
    private audit: AuditService,
  ) {}

  /** The server's public key, needed by the browser to subscribe. Not a secret. */
  @Get("key")
  key() {
    return { publicKey: this.push.publicKey };
  }

  @Post("subscriptions")
  @Auth({ kind: "any" })
  async subscribe(@Body() body: unknown, @CurrentSession() session: LiveSession, @Req() request: Request) {
    // "This is not my device" means no notifications on it.
    if (session.sharedDevice) {
      throw new ApiException(409, "CONFLICT", "Notifications are off on a device that isn't yours.");
    }
    const { endpoint, keys } = parse(pushSubscription, body);
    const owner = session.patientId
      ? { patientId: session.patientId, staffId: null }
      : { patientId: null, staffId: session.staffId! };
    const device = deviceType(request.header("user-agent"));
    const details = { p256dh: keys.p256dh, auth: keys.auth, device, ...owner };

    // The same browser may have been someone else's: it now belongs to whoever turned notifications on.
    await this.db.client.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, ...details },
      update: details,
    });

    const actor = session.patientId
      ? ({ type: "patient", id: session.patientId } as const)
      : ({ type: "staff", id: session.staffId } as const);
    await this.audit.record(actor, "push.on", { device }, request.ip);
    return { ok: true };
  }

  @Delete("subscriptions")
  @HttpCode(200)
  @Auth({ kind: "any" })
  async unsubscribe(@Body() body: unknown, @CurrentSession() session: LiveSession) {
    const { endpoint } = parse(pushSubscription.pick({ endpoint: true }), body);
    await this.db.client.pushSubscription.deleteMany({
      where: {
        endpoint,
        OR: [{ patientId: session.patientId ?? undefined }, { staffId: session.staffId ?? undefined }],
      },
    });
    return { ok: true };
  }
}
