import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * DESIGN.md §4: on phones the primary action is pinned to the bottom of the screen, within
 * thumb reach. From 640 px it sits in the page flow under the form.
 */
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <div className="h-24 sm:hidden" aria-hidden />
      <div className={cn("fixed inset-x-0 bottom-0 z-30 flex flex-col gap-3 border-t border-border bg-surface px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-overlay sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none", className)}>
        {children}
      </div>
    </>
  );
}
