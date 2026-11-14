"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { Logo } from "@/components/app/logo";
import { LogoutButton } from "@/components/app/logout-button";
import { StaffNav, type NavItem } from "@/components/app/staff-nav";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/cn";

const KEY = "uc-sidebar";

// The folded choice lives in this device's storage; the server always renders the panel open.
const listeners = new Set<() => void>();
let current: boolean | null = null; // this page's choice, so the toggle works even where storage is blocked
function read() {
  if (current !== null) return current;
  try {
    return localStorage.getItem(KEY) === "folded";
  } catch {
    return false;
  }
}
function write(folded: boolean) {
  current = folded;
  try {
    localStorage.setItem(KEY, folded ? "folded" : "open");
  } catch {
    /* not remembered, still works */
  }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
// A springy ease: the panel overshoots a little and settles, so the slide reads as one heavy object (D71).
const SLIDE = "duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none";

/**
 * The staff layout (DECISIONS.md D18, D71): the floating navigation panel and the page beside it. From 768 px the
 * panel can be folded to its icons; the choice is remembered on this device. Phones keep the row at the top.
 */
export function StaffFrame({ items, name, role, children }: { items: NavItem[]; name: string; role: string; children: ReactNode }) {
  const folded = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => write(!folded);
  const initials = name
    .replace(/^Dr\.?\s+/, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <div
      className={cn("min-h-dvh p-3 md:grid md:grid-cols-[var(--side)_minmax(0,1fr)] md:gap-3 md:transition-[grid-template-columns]", SLIDE)}
      style={{ ["--side" as string]: folded ? "76px" : "240px" }}
    >
      <Squircle
        as="aside"
        radius="xl"
        data-folded={folded || undefined}
        className="flex flex-col gap-4 overflow-hidden px-4 py-3 sq-bg-surface sq-border-border md:sticky md:top-3 md:h-[calc(100dvh-1.5rem)] md:gap-8 md:py-6 md:data-folded:px-3"
      >
        <div className={cn("flex items-center justify-between gap-2 md:px-1", folded && "md:flex-col md:px-0")}>
          {/* Folded, the heart symbol stands in for the name */}
          <span className={cn("max-md:contents", folded && "md:hidden")}>
            <Logo href="/staff" variant="compact" height={18} />
          </span>
          {folded && (
            <span className="hidden md:inline-flex">
              <Logo href="/staff" variant="symbol" />
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={folded ? "Expand the menu" : "Collapse the menu"}
            aria-expanded={!folded}
            title={folded ? "Expand the menu" : "Collapse the menu"}
            className="hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-secondary hover:bg-sunken hover:text-fg focus-visible:outline-2 focus-visible:outline-primary md:inline-flex [&_svg]:size-5"
          >
            {folded ? <LuPanelLeftOpen /> : <LuPanelLeftClose />}
          </button>
          <div className="md:hidden">
            <LogoutButton to="/staff/login" />
          </div>
        </div>
        {items.length > 1 && <StaffNav items={items} folded={folded} className="md:flex-1" />}
        <div className="hidden flex-col gap-3 border-t border-border pt-4 md:mt-auto md:flex">
          {folded ? (
            <span
              title={`${name} · ${role}`}
              className="mx-auto flex size-10 items-center justify-center rounded-full bg-accent-soft text-small font-semibold text-info-fg"
            >
              {initials}
            </span>
          ) : (
            <div className="flex flex-col px-3">
              <span className="truncate text-small font-semibold text-fg">{name}</span>
              <span className="truncate text-caption text-fg-secondary">{role}</span>
            </div>
          )}
          <LogoutButton to="/staff/login" iconOnly={folded} />
        </div>
      </Squircle>
      {children}
    </div>
  );
}
