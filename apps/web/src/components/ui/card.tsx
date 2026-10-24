import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/**
 * DESIGN.md §9. `highlighted` is the one blue card a screen may have (RESEARCH R4),
 * for example the patient's current case.
 */
export function Card({
  highlighted = false,
  className,
  ...rest
}: ComponentPropsWithoutRef<"div"> & { highlighted?: boolean }) {
  return (
    <Squircle
      radius="lg"
      className={cn(
        "p-4 md:p-6",
        highlighted ? "sq-bg-accent-soft sq-border-accent-line" : "sq-bg-surface sq-border-border",
        className,
      )}
      {...rest}
    />
  );
}
