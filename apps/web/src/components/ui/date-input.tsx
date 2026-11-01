"use client";

import { useId } from "react";
import { PiCaretDownBold, PiWarningCircleBold } from "react-icons/pi";
import { useT } from "@/i18n/client";
import { monthNames } from "@/i18n/dates";
import { cn } from "@/lib/cn";
import type { DateParts } from "@/lib/date-parts";
import { controlShell, controlText } from "./field";
import { Squircle } from "./squircle";

type DateInputProps = {
  label: string;
  value: DateParts;
  onChange: (value: DateParts) => void;
  error?: string;
};

/**
 * A date as three boxes: day, month by name, and year. A phone's calendar picker opens on today,
 * which leaves a date of birth decades of scrolling away; these take a few taps for any age.
 */
export function DateInput({ label, value, onChange, error }: DateInputProps) {
  const { t, lang } = useT();
  const id = useId();
  const errorId = `${id}-error`;
  const invalid = !!error;
  const digits = (text: string, length: number) => text.replace(/\D/g, "").slice(0, length);

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 text-small font-medium text-fg">{label}</legend>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-day`} className="text-caption text-fg-secondary">
            {t.login.day}
          </label>
          <Squircle radius="md" focus="within" className={cn(controlShell(invalid), "h-12 px-3")}>
            <input
              id={`${id}-day`}
              inputMode="numeric"
              autoComplete="bday-day"
              aria-invalid={invalid || undefined}
              className={cn(controlText, "h-full")}
              value={value.day}
              onChange={(event) => onChange({ ...value, day: digits(event.target.value, 2) })}
            />
          </Squircle>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-month`} className="text-caption text-fg-secondary">
            {t.login.month}
          </label>
          <Squircle radius="md" focus="within" className={cn(controlShell(invalid), "h-12")}>
            <select
              id={`${id}-month`}
              autoComplete="bday-month"
              aria-invalid={invalid || undefined}
              className={cn(controlText, "h-full cursor-pointer appearance-none pr-9 pl-3")}
              value={value.month}
              onChange={(event) => onChange({ ...value, month: event.target.value })}
            >
              <option value="" disabled />
              {monthNames(lang).map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                </option>
              ))}
            </select>
            <PiCaretDownBold className="pointer-events-none absolute right-3 size-5 text-fg-secondary" aria-hidden />
          </Squircle>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-year`} className="text-caption text-fg-secondary">
            {t.login.year}
          </label>
          <Squircle radius="md" focus="within" className={cn(controlShell(invalid), "h-12 px-3")}>
            <input
              id={`${id}-year`}
              inputMode="numeric"
              autoComplete="bday-year"
              aria-invalid={invalid || undefined}
              className={cn(controlText, "h-full")}
              value={value.year}
              onChange={(event) => onChange({ ...value, year: digits(event.target.value, 4) })}
            />
          </Squircle>
        </div>
      </div>
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-small font-medium text-urgent-fg">
          <PiWarningCircleBold className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </fieldset>
  );
}
