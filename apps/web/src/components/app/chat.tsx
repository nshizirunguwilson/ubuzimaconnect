"use client";

import { QUICK_REPLIES, VOICE_MAX_MS } from "@ubuzima/shared";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { LuMic, LuSendHorizontal, LuX } from "react-icons/lu";
import {
  AudioPlayerButton,
  AudioPlayerProgress,
  AudioPlayerProvider,
  AudioPlayerTime,
} from "@/components/ui/audio-player";
import { Button } from "@/components/ui/button";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/time";

/** The chat's own words; the patient app passes them in the patient's language (NFR 7). Staff use the English defaults. */
export type ChatLabels = {
  messages: string;
  empty: string;
  you: string;
  agent: string;
  send: string;
  quickReplies: string;
  quick: Record<string, string>;
  /** Server sentences (system notes) in the reader's language. */
  system: (text: string) => string;
  /** D74: voice notes. Optional; English when not given. */
  record?: string;
  recording?: string;
  sendVoice?: string;
  cancelVoice?: string;
  voiceNote?: string;
  micBlocked?: string;
  play?: string;
  pause?: string;
};
const EN: Required<ChatLabels> = {
  messages: "Messages",
  empty: "No messages yet.",
  you: "You",
  agent: "Agent",
  send: "Send",
  quickReplies: "Quick replies",
  quick: {},
  system: (t) => t,
  record: "Record a voice note",
  recording: "Recording",
  sendVoice: "Send the voice note",
  cancelVoice: "Cancel the recording",
  voiceNote: "Voice note",
  micBlocked: "Allow the microphone in your browser to send a voice note.",
  play: "Play the voice note",
  pause: "Pause",
};

export type ChatMsg = {
  id: string;
  sender: "PATIENT" | "AGENT" | "SYSTEM";
  text: string;
  createdAt: string | Date;
  staffName?: string | null;
  audioMs?: number | null;
};

/** D74: how to send and play voice notes in this chat. */
export type ChatVoice = {
  send: (dataUrl: string, durationMs: number) => Promise<void>;
  url: (messageId: string) => string;
};

const clock = (ms: number) =>
  `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/**
 * D74, D78: records up to two minutes with the browser's own recorder (WebM/Opus, or MP4 on Safari), then hands back a
 * data URL. The live waveform opens the microphone; the recorder records that same stream, so the browser asks once.
 */
function useRecorder(
  onDone: (dataUrl: string, ms: number) => void,
  onBlocked: () => void,
) {
  const [ms, setMs] = useState<number | null>(null);
  const rec = useRef<{
    mr: MediaRecorder;
    chunks: Blob[];
    start: number;
    timer: ReturnType<typeof setInterval>;
    keep: boolean;
  } | null>(null);
  const done = useRef(onDone);
  const blocked = useRef(onBlocked);
  useEffect(() => {
    done.current = onDone;
    blocked.current = onBlocked;
  });

  const stop = useCallback((keep: boolean) => {
    const r = rec.current;
    if (!r || r.mr.state === "inactive") return setMs(null); // the microphone wasn't ready yet: nothing to keep
    r.keep = keep;
    r.mr.stop();
  }, []);

  /** Called by the waveform once the microphone is open. */
  const onStream = useCallback(
    (stream: MediaStream) => {
      if (rec.current) return; // one recording at a time
      const type = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const mr = new MediaRecorder(
        stream,
        type ? { mimeType: type, audioBitsPerSecond: 32_000 } : undefined,
      );
      const r = {
        mr,
        chunks: [] as Blob[],
        start: Date.now(),
        keep: true,
        timer: setInterval(() => {
          const t = Date.now() - r.start;
          setMs(t);
          if (t >= VOICE_MAX_MS) stop(true); // two minutes at most: send what was said
        }, 200),
      };
      rec.current = r;
      mr.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      mr.onstop = () => {
        clearInterval(r.timer);
        const length = Math.min(Date.now() - r.start, VOICE_MAX_MS);
        rec.current = null;
        setMs(null); // closes the waveform, which closes the microphone
        if (!r.keep || length < 500) return;
        const reader = new FileReader();
        reader.onload = () => done.current(String(reader.result), length);
        reader.readAsDataURL(new Blob(r.chunks, { type: mr.mimeType }));
      };
      mr.start(250);
    },
    [stop],
  );
  const onError = useCallback(() => {
    setMs(null);
    blocked.current();
  }, []);

  useEffect(() => () => stop(false), [stop]);
  return { ms, start: () => setMs(0), stop, onStream, onError };
}

/**
 * FR 6.6: text chat with quick replies. New messages are announced to screen readers (DESIGN.md §8),
 * not animated. Messages from me are on the right; system notes are centred and quiet.
 */
export function Chat({
  messages,
  me,
  onSend,
  disabled,
  placeholder = "Write a message",
  quickReplies = false,
  sendVariant = "primary",
  labels: given = EN,
  voice,
  className,
}: {
  messages: ChatMsg[];
  me: "PATIENT" | "AGENT";
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  quickReplies?: boolean;
  /** One primary button per screen (DESIGN.md §1): secondary where something else is primary. */
  sendVariant?: "primary" | "secondary";
  labels?: ChatLabels;
  /** D74: voice notes, where this chat allows them. */
  voice?: ChatVoice;
  className?: string;
}) {
  const labels = { ...EN, ...given };
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const recorder = useRecorder(
    async (dataUrl, ms) => {
      setSending(true);
      try {
        await voice?.send(dataUrl, ms);
      } finally {
        setSending(false);
      }
    },
    () => setBlocked(true),
  );
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(value: string) {
    const t = value.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <AudioPlayerProvider>
      <div className={cn("flex min-h-0 flex-col gap-3", className)}>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-3 [scrollbar-gutter:stable]"
          aria-live="polite"
          aria-label={labels.messages}
        >
          {messages.length === 0 && (
            <p className="py-6 text-center text-small text-fg-muted">
              {labels.empty}
            </p>
          )}
          {messages.map((m) =>
            m.sender === "SYSTEM" ? (
              <p
                key={m.id}
                className="mx-auto max-w-[80%] py-1 text-center text-caption text-fg-secondary"
              >
                {labels.system(m.text)}
              </p>
            ) : (
              <div
                key={m.id}
                className={cn(
                  "flex max-w-[85%] flex-col gap-1",
                  m.sender === me
                    ? "items-end self-end"
                    : "items-start self-start",
                )}
              >
                <Squircle
                  radius="lg"
                  className={cn(
                    "px-3.5 py-2 text-body whitespace-pre-wrap",
                    m.sender === me
                      ? "sq-bg-accent-soft text-fg"
                      : "sq-bg-surface sq-border-border text-fg",
                  )}
                >
                  {m.audioMs && voice ? (
                    <VoiceNote
                      id={m.id}
                      src={voice.url(m.id)}
                      ms={m.audioMs}
                      labels={labels}
                    />
                  ) : (
                    m.text
                  )}
                </Squircle>
                <span className="px-1 text-caption text-fg-muted">
                  {m.sender === me
                    ? labels.you
                    : m.sender === "AGENT"
                      ? (m.staffName ?? labels.agent)
                      : "Patient"}{" "}
                  · {formatTime(m.createdAt)}
                </span>
              </div>
            ),
          )}
          <div ref={end} />
        </div>
        {!disabled && (
          <>
            {quickReplies && (
              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]"
                aria-label={labels.quickReplies}
              >
                {QUICK_REPLIES.map((q) => (
                  <Squircle
                    key={q}
                    as="button"
                    type="button"
                    radius="md"
                    focus="self"
                    onClick={() => send(labels.quick[q] ?? q)}
                    className="h-10 shrink-0 cursor-pointer px-3.5 text-small font-medium text-fg sq-bg-surface sq-border-border-strong hover:sq-bg-sunken"
                  >
                    {labels.quick[q] ?? q}
                  </Squircle>
                ))}
              </div>
            )}
            {blocked && (
              <p className="text-caption text-urgent-fg">{labels.micBlocked}</p>
            )}
            {recorder.ms !== null ? (
              // D78: while recording, the waveform follows the voice, with the time, cancel and send.
              <div
                className="flex items-center gap-2"
                role="group"
                aria-label={labels.recording}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.cancelVoice}
                  onClick={() => recorder.stop(false)}
                >
                  <LuX />
                </Button>
                <Squircle
                  radius="md"
                  className="flex h-11 min-w-0 flex-1 items-center gap-3 px-3 sq-bg-urgent-soft"
                >
                  <span
                    className="size-2.5 shrink-0 animate-pulse rounded-full bg-urgent"
                    aria-hidden
                  />
                  <span className="sr-only">{labels.recording}</span>
                  <LiveWaveform
                    active
                    mode="scrolling"
                    height={28}
                    barWidth={3}
                    barGap={2}
                    sensitivity={1.6}
                    fadeWidth={16}
                    onStreamReady={recorder.onStream}
                    onError={recorder.onError}
                    className="min-w-0 flex-1 text-urgent"
                  />
                  <span
                    className="shrink-0 font-mono text-small text-fg-secondary tabular-nums"
                    aria-live="off"
                  >
                    {clock(recorder.ms)} / {clock(VOICE_MAX_MS)}
                  </span>
                </Squircle>
                <Button
                  type="button"
                  variant={sendVariant}
                  size="icon"
                  aria-label={labels.sendVoice}
                  onClick={() => recorder.stop(true)}
                >
                  <LuSendHorizontal />
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void send(text);
                }}
                className="flex items-end gap-2"
              >
                <Squircle
                  radius="md"
                  focus="within"
                  className="flex min-w-0 flex-1 items-center px-3 sq-bg-surface sq-border-border-strong"
                >
                  <label htmlFor="chat-input" className="sr-only">
                    {placeholder}
                  </label>
                  <textarea
                    id="chat-input"
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send(text);
                      }
                    }}
                    placeholder={placeholder}
                    className="max-h-32 min-h-11 w-full resize-none bg-transparent py-2.5 text-body text-fg outline-none placeholder:text-fg-muted"
                  />
                </Squircle>
                {/* Nothing typed: the microphone; something typed: send (D74) */}
                {voice && !text.trim() && !sending ? (
                  <Button
                    type="button"
                    variant={sendVariant}
                    size="icon"
                    aria-label={labels.record}
                    title={labels.record}
                    onClick={() => {
                      setBlocked(false);
                      void recorder.start();
                    }}
                  >
                    <LuMic />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant={sendVariant}
                    size="icon"
                    aria-label={labels.send}
                    loading={sending}
                    disabled={!text.trim()}
                  >
                    <LuSendHorizontal />
                  </Button>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </AudioPlayerProvider>
  );
}

/** D78: a voice note in a bubble: play or pause, a seek bar and the time. One note plays at a time in a chat. */
function VoiceNote({
  id,
  src,
  ms,
  labels,
}: {
  id: string;
  src: string;
  ms: number;
  labels: Required<ChatLabels>;
}) {
  const item = { id, src };
  return (
    <span
      className="flex w-60 max-w-full items-center gap-2"
      role="group"
      aria-label={`${labels.voiceNote}, ${clock(ms)}`}
    >
      <AudioPlayerButton
        item={item}
        variant="secondary"
        size="icon"
        className="shrink-0"
        labels={{ play: labels.play, pause: labels.pause }}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <AudioPlayerProgress
          item={item}
          duration={ms / 1000}
          aria-label={labels.voiceNote}
        />
        <AudioPlayerTime item={item} duration={ms / 1000} />
      </span>
    </span>
  );
}
