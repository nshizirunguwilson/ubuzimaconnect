import { Controller, Get, NotFoundException } from "@nestjs/common";
import { DbService } from "../common/db.service";
import { env } from "../common/env";

/** The made-up addresses of the seeded demo accounts. Nothing is ever really sent to them. */
export const DEMO_DOMAIN = "@ubuzima.test";

/**
 * D66: the emails a grader needs to log in as a demo staff member (codes, invitations, reset links).
 * Locally: every email, since none is really sent. On the live site, only with DEMO_INBOX=1, and only
 * emails to the demo addresses: a real staff member's email never appears here.
 */
@Controller()
export class DevController {
  constructor(private db: DbService) {}

  @Get(["dev/outbox", "demo/inbox"])
  inbox() {
    if (env.prod && !env.demoInbox) throw new NotFoundException();
    return this.db.client.emailMessage.findMany({
      where: env.prod ? { to: { endsWith: DEMO_DOMAIN } } : {},
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, to: true, subject: true, text: true, createdAt: true },
    });
  }
}
