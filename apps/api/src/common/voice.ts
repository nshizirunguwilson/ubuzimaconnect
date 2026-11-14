import { audioType, voiceNote } from "@ubuzima/shared";
import type { Response } from "express";
import type { EventsService } from "../live/events.service";
import type { DbService } from "./db.service";
import { ApiException } from "./errors";
import { parse } from "./zod";

/**
 * D74: voice notes in the chat. The sound is checked by its first bytes (only WebM, Ogg, MP4 or MP3 audio is kept),
 * stored apart from the message, and played only through the same access checks as the chat itself.
 * The AI never receives it: triage reads only the written description (FR 4.3).
 */
export async function saveVoice(
  db: DbService,
  events: EventsService,
  from: { caseId: string; sender: "PATIENT" | "AGENT"; staffId?: string; staffName?: string },
  body: unknown,
) {
  const { audio, durationMs } = parse(voiceNote, body);
  const bytes = Buffer.from(audio.slice(audio.indexOf(",") + 1), "base64");
  const type = audioType(bytes);
  if (!type) throw new ApiException(400, "VALIDATION", "That isn't a voice recording. Record it again.");
  const m = await db.client.chatMessage.create({
    data: {
      caseId: from.caseId,
      sender: from.sender,
      staffId: from.staffId ?? null,
      text: "Voice note",
      audioMs: durationMs,
      audio: { create: { mimeType: type, data: bytes } },
    },
  });
  events.emit(`case:${from.caseId}`, {
    type: "message",
    caseId: from.caseId,
    message: { id: m.id, sender: from.sender, text: m.text, createdAt: m.createdAt.toISOString(), staffName: from.staffName ?? null, audioMs: durationMs },
  });
  return { id: m.id };
}

export async function sendVoice(db: DbService, res: Response, caseId: string, messageId: string) {
  const a = await db.client.chatAudio.findFirst({ where: { messageId, message: { caseId } } });
  if (!a) throw new ApiException(404, "NOT_FOUND", "This voice note doesn't exist.");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type(a.mimeType).send(Buffer.from(a.data));
}
