"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { LuChevronDown, LuCircleAlert } from "react-icons/lu";
import { cn } from "@/lib/cn";
import { Squircle } from "./squircle";

/**
 * DESIGN.md §9: the label is always above, helper text below, and an error
 * replaces the helper with an icon and a message in red-700. Inputs are 16 px (§3).
 */
type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  /** Show "Optional" next to the label; required is the default. */
  optional?: boolean;
  className?: string;
  children: (control: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
};

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-small font-medium text-fg">
        {label}
        {optional && <span className="font-normal text-fg-muted"> (optional)</span>}
      </label>
      {children({ id, describedBy: note ? noteId : undefined, invalid: !!error })}
      {note && (
        <p
          id={noteId}
          className={cn(
            "flex items-start gap-1.5 text-small",
            error ? "font-medium text-urgent-fg" : "text-fg-secondary",
          )}
        >
          {error && <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {note}
        </p>
      )}
    </div>
  );
}

function controlShell(invalid: boolean, disabled?: boolean) {
  return cn(
    "flex w-full items-center sq-bg-surface",
    invalid ? "sq-border-urgent" : "sq-border-border-strong hover:sq-border-gray-500",
    disabled && "sq-bg-sunken sq-border-border hover:sq-border-border text-fg-disabled",
  );
}

const controlText =
  "w-full min-w-0 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed";

type InputProps = Omit<ComponentPropsWithoutRef<"input">, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  /** An icon or unit shown inside the field, before the text. */
  leading?: ReactNode;
  /** A control at the end of the field, e.g. "Show" for a password. */
  trailing?: ReactNode;
  mono?: boolean;
};

export function Input({ label, hint, error, optional, leading, trailing, mono, className, disabled, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <Squircle radius="md" focus="within" className={cn(controlShell(invalid, disabled), "h-12 gap-2 px-3")}>
          {leading && <span className="flex shrink-0 text-fg-muted [&_svg]:size-5">{leading}</span>}
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={!optional}
            disabled={disabled}
            className={cn(controlText, "h-full", mono && "font-mono font-medium tracking-wide")}
            {...rest}
          />
          {trailing && <span className="-mr-2 flex shrink-0">{trailing}</span>}
        </Squircle>
      )}
    </Field>
  );
}

type TextareaProps = Omit<ComponentPropsWithoutRef<"textarea">, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
};

export function Textarea({ label, hint, error, optional, className, disabled, rows = 4, ...rest }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <Squircle radius="md" focus="within" className={cn(controlShell(invalid, disabled), "px-3 py-2.5")}>
          <textarea
            id={id}
            rows={rows}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={!optional}
            disabled={disabled}
            className={cn(controlText, "resize-y")}
            {...rest}
          />
        </Squircle>
      )}
    </Field>
  );
}

type SelectProps = Omit<ComponentPropsWithoutRef<"select">, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  placeholder?: string;
  options: { value: string; label: string }[];
};

/** A native select: the phone's own picker is the most familiar control for our users. */
export function Select({
  label,
  hint,
  error,
  optional,
  placeholder,
  options,
  className,
  disabled,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <Squircle radius="md" focus="within" className={cn(controlShell(invalid, disabled), "h-12")}>
          <select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            required={!optional}
            disabled={disabled}
            defaultValue={placeholder && rest.value === undefined ? "" : undefined}
            className={cn(controlText, "h-full cursor-pointer appearance-none pr-10 pl-3 invalid:text-fg-muted")}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <LuChevronDown className="pointer-events-none absolute right-3 size-5 text-fg-secondary" aria-hidden />
        </Squircle>
      )}
    </Field>
  );
}
