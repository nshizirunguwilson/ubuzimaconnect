import { Injectable, Logger } from "@nestjs/common";
import { DbService } from "./db.service";
import { DEMO_DOMAIN } from "../dev/dev.controller";
import { env } from "./env";

/**
 * Plain-text email. With RESEND_API_KEY it is sent through Resend; without one (local
 * development) it is only saved to the outbox, which the web app shows at /demo/inbox.
 * Emails to the made-up demo addresses are never sent: they'd bounce and harm the domain's reputation (D66).
 */
@Injectable()
export class MailService {
  private log = new Logger("Mail");

  constructor(private db: DbService) {}

  async send(to: string, subject: string, text: string) {
    const provider = env.resendKey && !to.endsWith(DEMO_DOMAIN) ? "resend" : "outbox";
    await this.db.client.emailMessage.create({ data: { to, subject, text, provider } });
    if (provider === "outbox") {
      this.log.log(`Outbox: "${subject}" to ${to}`);
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.mailFrom, to, subject, text }),
    });
    if (!res.ok) this.log.error(`Resend failed (${res.status}) for "${subject}"`);
  }
}
