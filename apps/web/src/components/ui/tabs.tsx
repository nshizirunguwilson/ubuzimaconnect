"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/** Tabs with counts (DESIGN.md §9, RESEARCH R2), e.g. "Urgent 3". The active tab is underlined in blue. */
export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...rest }: ComponentPropsWithoutRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn("flex gap-6 overflow-x-auto border-b border-border [scrollbar-width:none]", className)}
      {...rest}
    />
  );
}

export function Tab({
  count,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof RadixTabs.Trigger> & { count?: number }) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "group relative -mb-px flex h-12 shrink-0 cursor-pointer items-center gap-2 border-b-2 border-transparent text-small font-medium text-fg-secondary",
        "transition-colors duration-150 hover:text-fg data-[state=active]:border-primary data-[state=active]:text-fg",
        "focus-visible:outline-offset-[-2px]",
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined && (
        <Squircle
          as="span"
          radius="sm"
          className="inline-flex h-5 min-w-5 items-center justify-center px-1.5 text-caption tabular-nums sq-bg-sunken text-fg-secondary group-data-[state=active]:sq-bg-accent-soft group-data-[state=active]:text-info-fg"
        >
          {count}
        </Squircle>
      )}
    </RadixTabs.Trigger>
  );
}
