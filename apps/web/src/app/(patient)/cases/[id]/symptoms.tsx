"use client";

import { DURATIONS, symptoms, type Duration } from "@ubuzima/shared";
import { useState, type FormEvent } from "react";
import { BottomBar } from "@/components/app/bottom-bar";
import { BackLink } from "@/components/patient/back-link";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/choice";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Squircle } from "@/components/ui/squircle";
import { api, ApiFailure } from "@/lib/api";
import { useT } from "@/i18n/client";
import { check } from "@/lib/form";
import { cn } from "@/lib/cn";
import type { CaseView } from "./case-flow";

/** Own words, how long, how bad. The AI has up to 10 seconds. */
export function Symptoms({
  view,
  onDone,
  onOffline,
  offline,
}: {
  view: CaseView;
  onDone: (v: CaseView) => void;
  onOffline: (data: unknown) => void;
  offline?: boolean;
}) {
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<Duration | "">("");
  const [severity, setSeverity] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const { t, tr } = useT();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = check(symptoms, {
      description,
      duration: duration || undefined,
      severity: severity ?? 0,
    });
    if (!result.data)
      return setErrors(
        Object.fromEntries(Object.entries(result.errors).map(([field, message]) => [field, tr(message)])),
      );
    setErrors({});
    if (offline) return onOffline(result.data);
    setPending(true);
    try {
      onDone(await api<CaseView>(`/cases/${view.id}/symptoms`, result.data));
    } catch (err) {
      setPending(false);
      if (err instanceof ApiFailure && err.status === 0) return onOffline(result.data);
      setErrors({
        form: err instanceof ApiFailure ? tr(err.error.message) : t.common.couldntSend,
      });
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <BackLink href="/home" label={t.common.home} />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t.case.whatsWrong}</h1>
        <p className="text-body text-fg-secondary">{t.case.noDangerSigns}</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-8">
        <Textarea
          label={view.forChild ? t.case.describeThem(view.subject.firstName) : t.case.describeYou}
          hint={t.case.describeHint}
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium text-fg">{t.case.howLong}</legend>
          {DURATIONS.map((option) => (
            <ChoiceRow
              key={option}
              name="duration"
              value={option}
              label={t.case.durations[option]}
              checked={duration === option}
              onChange={() => setDuration(option)}
            />
          ))}
          {errors.duration && <p className="text-small font-medium text-urgent-fg">{errors.duration}</p>}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium text-fg">{t.case.howBad}</legend>
          <p className="text-small text-fg-secondary">{t.case.howBadHint}</p>
          <div role="radiogroup" aria-label={t.case.howBadAria} className="grid grid-cols-5 gap-2 sm:flex">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
              <Squircle
                key={score}
                as="button"
                type="button"
                role="radio"
                aria-checked={severity === score}
                radius="md"
                focus="self"
                onClick={() => setSeverity(score)}
                className={cn(
                  "flex h-12 cursor-pointer items-center justify-center text-body font-medium tabular-nums sm:w-12",
                  severity === score
                    ? "sq-bg-accent-soft sq-border-primary text-info-fg"
                    : "sq-bg-surface sq-border-border-strong text-fg hover:sq-bg-gray-50",
                )}
              >
                {score}
              </Squircle>
            ))}
          </div>
          {errors.severity && <p className="text-small font-medium text-urgent-fg">{errors.severity}</p>}
        </fieldset>
        {errors.form && <Notice tone="urgent" title={errors.form} />}
        {offline && <OfflineNote />}
        <BottomBar>
          <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto sm:self-start">
            {pending ? t.case.sending : t.case.send}
          </Button>
        </BottomBar>
      </form>
    </main>
  );
}

/** While answers wait on the device. */
export function OfflineNote() {
  const { t } = useT();
  return (
    <Notice tone="warning" title={t.offline.noConnection}>
      {t.offline.keepGoing}
    </Notice>
  );
}
