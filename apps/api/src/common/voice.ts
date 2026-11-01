import { audioType, voiceNote } from "@ubuzima/shared";
import type { Response } from "express";
import type { EventsService } from "../live/events.service";
import type { DbService } from "./db.service";
import { ApiException } from "./errors";
import { parse } from "./zod";

/**
 * Voice notes in the chat. The sound is checked by its first bytes (only WebM, Ogg, MP4 or MP3 audio is kept),
 * stored apart from the message, and played only through the same access checks as the chat itself.
 * The AI never receives it: triage reads only the written description.
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
  const message = await db.client.chatMessage.create({
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
    message: {
      id: message.id,
      sender: from.sender,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      staffName: from.staffName ?? null,
      audioMs: durationMs,
    },
  });
  return { id: message.id };
}

export async function sendVoice(db: DbService, response: Response, caseId: string, messageId: string) {
  const audio = await db.client.chatAudio.findFirst({ where: { messageId, message: { caseId } } });
  if (!audio) throw new ApiException(404, "NOT_FOUND", "This voice note doesn't exist.");
  response.setHeader("Cache-Control", "private, max-age=86400");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.type(audio.mimeType).send(Buffer.from(audio.data));
}
