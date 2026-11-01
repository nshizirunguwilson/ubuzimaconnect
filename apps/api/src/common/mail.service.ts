import { Injectable, Logger } from "@nestjs/common";
import { DEMO_DOMAIN } from "../dev/dev.controller";
import { DbService } from "./db.service";
import { env } from "./env";

/**
 * Sends plain-text email. Every email is saved in the database first.
 * With RESEND_API_KEY it is then sent through Resend. Without one (local development) it stays in that outbox,
 * which the web app shows at /demo/inbox.
 * Emails to the made-up demo addresses are never sent: they would bounce and harm the domain's reputation.
 */
@Injectable()
export class MailService {
  private log = new Logger("Mail");

  constructor(private db: DbService) {}

  async send(to: string, subject: string, text: string) {
    const isDemoAddress = to.endsWith(DEMO_DOMAIN);
    const provider = env.resendKey && !isDemoAddress ? "resend" : "outbox";

    await this.db.client.emailMessage.create({ data: { to, subject, text, provider } });

    if (provider === "outbox") {
      this.log.log(`Outbox: "${subject}" to ${to}`);
      return;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.mailFrom, to, subject, text }),
    });
    if (!response.ok) {
      this.log.error(`Resend failed (${response.status}) for "${subject}"`);
    }
  }
}
