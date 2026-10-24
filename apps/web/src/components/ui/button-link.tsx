"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";
import { buttonClass, type ButtonProps } from "./button";

/** A link that looks like a Button, for navigation (Button is for actions). */
export function ButtonLink({
  variant = "secondary",
  size = "default",
  icon,
  className,
  children,
  ...rest
}: Omit<ComponentProps<typeof Link>, "as"> & Pick<ButtonProps, "variant" | "size"> & { icon?: ReactNode }) {
  return (
    <Squircle
      as={Link}
      radius={size === "icon" ? "sm" : "md"}
      focus="self"
      className={cn(buttonClass(variant, size), className)}
      {...rest}
    >
      {icon}
      {children}
    </Squircle>
  );
}
