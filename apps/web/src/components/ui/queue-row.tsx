"use client";

import type { ReactNode } from "react";
import { LuChevronRight } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/**
 * Queue row (DESIGN.md §9, RESEARCH R2 and R3): primary text, one status badge and the
 * time on the right. Only what decides the next action. The whole row is one button.
 */
export function QueueRow({
  title,
  meta,
  status,
  time,
  timeLabel,
  selected = false,
  onClick,
  className,
}: {
  title: string;
  meta?: string;
  status?: ReactNode;
  /** Short visible time, e.g. "4 min". */
  time?: string;
  /** Full time for screen readers and the tooltip, e.g. "Waiting 4 minutes, since 10:42". */
  timeLabel?: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Squircle
      as="button"
      type="button"
      radius="md"
      focus="self"
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        "flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left",
        selected ? "sq-bg-accent-soft" : "hover:sq-bg-sunken",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body font-semibold text-fg">{title}</span>
        {meta && <span className="truncate text-small text-fg-secondary">{meta}</span>}
      </span>
      {status && <span className="shrink-0">{status}</span>}
      {time && (
        <span className="w-14 shrink-0 text-right text-small text-fg-secondary tabular-nums" title={timeLabel}>
          <span aria-hidden={!!timeLabel}>{time}</span>
          {timeLabel && <span className="sr-only">{timeLabel}</span>}
        </span>
      )}
      <LuChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden />
    </Squircle>
  );
}
