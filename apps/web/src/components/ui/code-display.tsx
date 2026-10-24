"use client";

import { useEffect, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/**
 * Code display (DESIGN.md §9): prescription codes and case numbers in Google Sans Code,
 * already grouped (RX-7K3M-9P2Q), with a copy button that confirms "Copied".
 */
export function CodeDisplay({ label, value, className }: { label: string; value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard can be blocked (e.g. http); the code stays selectable.
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-small font-medium text-fg">{label}</span>
      <Squircle radius="md" className="flex h-14 items-center gap-2 pr-2 pl-4 sq-bg-sunken">
        <span className="flex-1 font-mono text-h2 font-medium tracking-wider text-fg tabular-nums select-all">
          {value}
        </span>
        <Squircle
          as="button"
          type="button"
          radius="sm"
          focus="self"
          onClick={copy}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 px-3 text-small font-medium text-fg hover:sq-bg-gray-200"
        >
          {copied ? <LuCheck className="size-5 text-success" aria-hidden /> : <LuCopy className="size-5" aria-hidden />}
          <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
        </Squircle>
      </Squircle>
    </div>
  );
}
