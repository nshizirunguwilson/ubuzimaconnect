"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { Squircle } from "./squircle";

/** A squircle-shaped link for server components, which can't pass Link itself to <Squircle as>. */
export function SquircleLink(props: Omit<ComponentProps<typeof Link>, "as"> & Pick<ComponentProps<typeof Squircle>, "radius" | "focus">) {
  return <Squircle as={Link} focus="self" {...props} />;
}
