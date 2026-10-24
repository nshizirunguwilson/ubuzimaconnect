"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Field } from "./field";
import { Squircle } from "./squircle";

/**
 * A 6-digit code shown as one box per digit (FR 2.2, 2.4). Underneath it is a single real input laid
 * over the boxes, so pasting the whole code, the device's "code from email" autofill and screen readers
 * all work as with a normal field (DECISIONS.md D41). Only digits are kept.
 */
export function CodeInput({
  label,
  value,
  onChange,
  error,
  hint,
  length = 6,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  error?: string;
  hint?: string;
  length?: number;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const digits = value.slice(0, length);
  // The box the next digit goes into; the last box once all are filled.
  const at = Math.min(digits.length, length - 1);
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <div className="relative flex gap-2">
          {Array.from({ length }, (_, i) => (
            <Squircle
              key={i}
              radius="md"
              aria-hidden
              className={cn(
                "flex h-14 min-w-0 flex-1 items-center justify-center font-mono text-h2 text-fg sq-bg-surface sm:max-w-14",
                invalid ? "sq-border-urgent" : focused && i === at ? "sq-bg-accent-soft sq-border-primary" : "sq-border-border-strong",
              )}
            >
              {digits[i] ?? (focused && i === at ? <span className="h-6 w-px animate-pulse bg-fg" /> : null)}
            </Squircle>
          ))}
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d*"
            maxLength={length}
            autoFocus={autoFocus}
            value={digits}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="absolute inset-0 w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
          />
        </div>
      )}
    </Field>
  );
}
