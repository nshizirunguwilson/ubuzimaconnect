"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Squircle } from "@/components/ui/squircle";

/** `icon` is a rendered element (e.g. <LuHouse />) so a server layout can pass it. */
export type NavItem = { href: string; label: string; icon: ReactNode };

/** RESEARCH R2: a narrow left navigation with a few labelled items; the active one is blue. */
export function StaffNav({ items, folded = false, className }: { items: NavItem[]; folded?: boolean; className?: string }) {
  const path = usePathname();
  const list = useRef<HTMLUListElement>(null);
  // Phones: bring the current page's item into view in the sideways-scrolling row.
  useEffect(() => {
    const el = list.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !current || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: current.offsetLeft - el.clientWidth / 2 + current.clientWidth / 2 });
  }, [path]);
  return (
    <nav aria-label="Main" className={className}>
      {/* Phones: one row that scrolls sideways; the padding keeps focus rings inside the scroll area */}
      <ul ref={list} className="-m-1 flex gap-1 overflow-x-auto p-1 [scrollbar-width:none] md:flex-col md:overflow-visible">
        {items.map(({ href, label, icon }) => {
          const active = href === "/staff" ? path === href : path.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Squircle
                as={Link}
                href={href}
                radius="md"
                focus="self"
                aria-current={active ? "page" : undefined}
                // Folded (D71): the label fades and slides away; the name stays for screen readers and as a tooltip.
                aria-label={folded ? label : undefined}
                title={folded ? label : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 px-3 text-small font-medium md:h-10",
                  folded && "md:justify-center md:gap-0 md:px-0",
                  active ? "sq-bg-accent-soft text-info-fg" : "text-fg-secondary hover:sq-bg-sunken hover:text-fg",
                )}
              >
                <span className="flex shrink-0 [&_svg]:size-5" aria-hidden>
                  {icon}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap transition-[opacity,translate,max-width] duration-300 ease-out motion-reduce:transition-none",
                    folded ? "md:max-w-0 md:-translate-x-3 md:opacity-0" : "md:max-w-48",
                  )}
                  aria-hidden={folded || undefined}
                >
                  {label}
                </span>
              </Squircle>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
