import type { ReactNode } from "react";

/** One H1 per page, one purpose line, and at most one primary action on the right (DESIGN.md §1). */
export function PageHeader({ title, intro, action }: { title: string; intro?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-[70ch] flex-col gap-2">
        <h1 className="text-h1 text-fg">{title}</h1>
        {intro && <p className="text-body text-fg-secondary">{intro}</p>}
      </div>
      {action}
    </div>
  );
}
