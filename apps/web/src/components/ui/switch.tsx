"use client";

import { cn } from "@/lib/cn";

/**
 * An on/off switch for a setting that takes effect at once (FR 4.8). The track is a true pill
 * and the knob a true circle, so no squircle is needed (DESIGN.md §5). 44 px target.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          "flex h-7 w-12 items-center rounded-full p-0.5 transition-colors duration-150",
          checked ? "bg-primary" : "bg-gray-300",
          disabled && "opacity-50",
        )}
      >
        <span className={cn("size-6 rounded-full bg-white shadow-overlay transition-transform duration-150", checked && "translate-x-5")} />
      </span>
    </button>
  );
}
