import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuCircleCheck, LuCircleHelp, LuInfo, LuTriangleAlert } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/** DESIGN.md §2: status is always icon + label + tint, never colour alone. */
const tones = {
  urgent: { className: "sq-bg-urgent-soft text-urgent-fg", Icon: LuTriangleAlert },
  warning: { className: "sq-bg-warning-soft text-warning-fg", Icon: LuCircleHelp },
  success: { className: "sq-bg-success-soft text-success-fg", Icon: LuCircleCheck },
  info: { className: "sq-bg-info-soft text-info-fg", Icon: LuInfo },
  neutral: { className: "sq-bg-sunken text-fg-secondary", Icon: null },
} satisfies Record<string, { className: string; Icon: IconType | null }>;

export type Tone = keyof typeof tones;

export function StatusBadge({
  tone,
  icon,
  children,
  className,
}: {
  tone: Tone;
  /** Override the tone's default icon; pass null for none (neutral only). */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { className: toneClass, Icon } = tones[tone];
  const glyph = icon === undefined ? Icon && <Icon aria-hidden /> : icon;
  return (
    <Squircle
      as="span"
      radius="sm"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 px-2.5 text-small font-medium whitespace-nowrap [&_svg:not(.sq-layer)]:size-4",
        toneClass,
        className,
      )}
    >
      {glyph}
      {children}
    </Squircle>
  );
}

/** SRS FR 4.4: the three triage levels. */
export type TriageLevel = "urgent" | "uncertain" | "minor";

const triage: Record<TriageLevel, { tone: Tone; label: string }> = {
  urgent: { tone: "urgent", label: "Urgent" },
  uncertain: { tone: "warning", label: "Uncertain" },
  minor: { tone: "success", label: "Minor" },
};

export function TriageBadge({ level, className }: { level: TriageLevel; className?: string }) {
  const { tone, label } = triage[level];
  return (
    <StatusBadge tone={tone} className={className}>
      {label}
    </StatusBadge>
  );
}
