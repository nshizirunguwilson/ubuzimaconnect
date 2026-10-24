"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/**
 * DESIGN.md §9. Primary is the only blue button on a screen.
 * Heights: 48 px on phones, 40 px from md up (§4). Labels are verbs.
 */
const variants = {
  primary:
    "sq-bg-primary text-white hover:sq-bg-primary-hover active:sq-bg-primary-pressed",
  secondary:
    "sq-bg-surface sq-border-border-strong text-fg hover:sq-bg-sunken active:sq-bg-gray-200",
  ghost: "text-fg hover:sq-bg-sunken active:sq-bg-gray-200",
  danger: "sq-bg-urgent text-white hover:sq-bg-urgent-fg active:sq-bg-urgent-fg",
} as const;

const sizes = {
  default: "h-12 gap-2 px-5 md:h-10 md:px-4",
  compact: "h-10 gap-2 px-4",
  icon: "size-11 md:size-10",
} as const;

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  icon?: ReactNode;
  loading?: boolean;
};

export function buttonClass(variant: keyof typeof variants, size: keyof typeof sizes) {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center text-small font-medium whitespace-nowrap select-none",
    "[&_svg:not(.sq-layer)]:size-5 [&_svg:not(.sq-layer)]:shrink-0",
    sizes[size],
    variants[variant],
  );
}

export function Button({
  variant = "secondary",
  size = "default",
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Squircle
      as="button"
      type={type}
      radius={size === "icon" ? "sm" : "md"}
      focus="self"
      disabled={inactive}
      aria-busy={loading || undefined}
      className={cn(
        buttonClass(variant, size),
        inactive && "cursor-not-allowed",
        disabled && !loading && "sq-bg-sunken sq-border-transparent text-fg-disabled hover:sq-bg-sunken",
        className,
      )}
      {...rest}
    >
      {loading ? <LuLoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
    </Squircle>
  );
}
