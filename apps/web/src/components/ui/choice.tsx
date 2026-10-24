"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { LuCheck } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/**
 * Choice row (DESIGN.md §9, RESEARCH R1): a full-width row with an icon, a label and an
 * optional one-line explanation. The chosen row is tinted. It is a real radio or checkbox,
 * so keyboard and screen readers work without extra code.
 */
type ChoiceRowProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  type?: "radio" | "checkbox";
  label: string;
  description?: string;
  icon?: ReactNode;
};

export function ChoiceRow({ type = "radio", label, description, icon, className, ...rest }: ChoiceRowProps) {
  return (
    <Squircle
      as="label"
      radius="md"
      focus="within"
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 sq-bg-surface sq-border-border-strong",
        "hover:sq-bg-gray-50 has-checked:sq-bg-accent-soft has-checked:sq-border-primary",
        "has-disabled:cursor-not-allowed has-disabled:sq-bg-sunken has-disabled:text-fg-disabled",
        className,
      )}
    >
      <input type={type} className="peer sr-only" {...rest} />
      {icon && <span className="flex shrink-0 text-fg-secondary [&_svg]:size-6">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-medium">{label}</span>
        {description && <span className="text-small text-fg-secondary">{description}</span>}
      </span>
      <Indicator type={type} />
    </Squircle>
  );
}

/** The 20 px mark at the end of a choice row; filled when the row is chosen. */
function Indicator({ type }: { type: "radio" | "checkbox" }) {
  if (type === "radio") {
    return (
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface peer-checked:border-[6px] peer-checked:border-primary"
      />
    );
  }
  return (
    <Squircle
      as="span"
      aria-hidden
      radius="xs"
      className="flex size-5 shrink-0 items-center justify-center sq-bg-surface sq-border-border-strong text-transparent peer-checked:sq-bg-primary peer-checked:sq-border-primary peer-checked:text-white"
    >
      <LuCheck className="size-3.5" strokeWidth={3} />
    </Squircle>
  );
}

/**
 * Checkbox and radio for plain lists (DESIGN.md §9): a 20 px control inside a 44 px target.
 */
type CheckProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & { label: string };

export function Checkbox({ label, className, ...rest }: CheckProps) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-body", className)}>
      <input type="checkbox" className="peer sr-only" {...rest} />
      <Squircle
        as="span"
        aria-hidden
        radius="xs"
        focus="peer"
        className="flex size-5 shrink-0 items-center justify-center sq-bg-surface sq-border-border-strong text-transparent peer-checked:sq-bg-primary peer-checked:sq-border-primary peer-checked:text-white peer-disabled:sq-bg-sunken"
      >
        <LuCheck className="size-3.5" strokeWidth={3} />
      </Squircle>
      <span className="peer-disabled:text-fg-disabled">{label}</span>
    </label>
  );
}

export function Radio({ label, className, ...rest }: CheckProps) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-body", className)}>
      <input type="radio" className="peer sr-only" {...rest} />
      <span
        aria-hidden
        className="size-5 shrink-0 rounded-full border border-border-strong bg-surface transition-[border] duration-150 peer-checked:border-[6px] peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:bg-sunken"
      />
      <span className="peer-disabled:text-fg-disabled">{label}</span>
    </label>
  );
}
