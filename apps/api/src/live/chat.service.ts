import { Injectable } from "@nestjs/common";
import { DbService } from "../common/db.service";
import { EventsService } from "./events.service";

type Sender = "PATIENT" | "AGENT" | "SYSTEM";

/** Chat messages on a case. */
@Injectable()
export class ChatService {
  constructor(
    private db: DbService,
    private events: EventsService,
  ) {}

  /**
   * Saves a message and shows it at once on every screen that has the case open.
   * An agent's message carries their name, so the patient sees who wrote it.
   */
  async post(caseId: string, sender: Sender, text: string, agent?: { id: string; name: string }) {
    const message = await this.db.client.chatMessage.create({
      data: { caseId, sender, text, staffId: agent?.id },
    });

    this.events.emit(`case:${caseId}`, {
      type: "message",
      caseId,
      message: {
        id: message.id,
        sender,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
        ...(agent ? { staffName: agent.name } : {}),
      },
    });
    return message;
  }
}
