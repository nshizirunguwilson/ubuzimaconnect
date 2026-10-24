"use client";

import { QUICK_REPLIES } from "@ubuzima/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LuSendHorizontal } from "react-icons/lu";
import { Button } from "@/components/ui/button";
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
};
const EN: ChatLabels = { messages: "Messages", empty: "No messages yet.", you: "You", agent: "Agent", send: "Send", quickReplies: "Quick replies", quick: {}, system: (t) => t };

export type ChatMsg = { id: string; sender: "PATIENT" | "AGENT" | "SYSTEM"; text: string; createdAt: string | Date; staffName?: string | null };

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
  labels = EN,
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
  className?: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-3 [scrollbar-gutter:stable]" aria-live="polite" aria-label={labels.messages}>
        {messages.length === 0 && <p className="py-6 text-center text-small text-fg-muted">{labels.empty}</p>}
        {messages.map((m) =>
          m.sender === "SYSTEM" ? (
            <p key={m.id} className="mx-auto max-w-[80%] py-1 text-center text-caption text-fg-secondary">
              {labels.system(m.text)}
            </p>
          ) : (
            <div key={m.id} className={cn("flex max-w-[85%] flex-col gap-1", m.sender === me ? "items-end self-end" : "items-start self-start")}>
              <Squircle
                radius="lg"
                className={cn("px-3.5 py-2 text-body whitespace-pre-wrap", m.sender === me ? "sq-bg-accent-soft text-fg" : "sq-bg-surface sq-border-border text-fg")}
              >
                {m.text}
              </Squircle>
              <span className="px-1 text-caption text-fg-muted">
                {m.sender === me ? labels.you : m.sender === "AGENT" ? (m.staffName ?? labels.agent) : "Patient"} · {formatTime(m.createdAt)}
              </span>
            </div>
          ),
        )}
        <div ref={end} />
      </div>
      {!disabled && (
        <>
          {quickReplies && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]" aria-label={labels.quickReplies}>
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
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void send(text);
            }}
            className="flex items-end gap-2"
          >
            <Squircle radius="md" focus="within" className="flex min-w-0 flex-1 items-center px-3 sq-bg-surface sq-border-border-strong">
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
            <Button type="submit" variant={sendVariant} size="icon" aria-label={labels.send} loading={sending} disabled={!text.trim()}>
              <LuSendHorizontal />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
