import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "./status";
import { Squircle } from "./squircle";
import { LuCircleCheck, LuInfo, LuTriangleAlert, LuCircleHelp } from "react-icons/lu";

const tones = {
  urgent: { box: "sq-bg-urgent-soft text-urgent-fg", Icon: LuTriangleAlert },
  warning: { box: "sq-bg-warning-soft text-warning-fg", Icon: LuCircleHelp },
  success: { box: "sq-bg-success-soft text-success-fg", Icon: LuCircleCheck },
  info: { box: "sq-bg-info-soft text-info-fg", Icon: LuInfo },
} as const;

/**
 * A message about the whole page or form, e.g. "Too many tries" or "You were logged out".
 * Same rule as status badges: icon + words + tint. Field errors stay under their field.
 */
export function Notice({
  tone,
  title,
  children,
  action,
  className,
}: {
  tone: Exclude<Tone, "neutral">;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <Squircle
      radius="md"
      role={tone === "urgent" ? "alert" : "status"}
      className={cn("flex gap-3 p-4", box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body font-semibold">{title}</p>
        {children && <div className="text-small text-fg">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </Squircle>
  );
}

