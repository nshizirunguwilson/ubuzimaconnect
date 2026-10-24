import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { cn } from "@/lib/cn";

/** Empty state (DESIGN.md §9): one icon, one sentence, at most one action. No illustrations. */
export function EmptyState({
  icon: Icon,
  message,
  action,
  className,
}: {
  icon: IconType;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-4 py-12 text-center", className)}>
      <Icon className="size-6 text-fg-muted" aria-hidden />
      <p className="max-w-[40ch] text-body text-fg-secondary">{message}</p>
      {action}
    </div>
  );
}
