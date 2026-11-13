"use client";

import { formatNationalId, nationalId as nationalIdSchema, patientLogin } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PiArrowLeftBold, PiIdentificationCardBold } from "react-icons/pi";
import { BottomBar } from "@/components/app/bottom-bar";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StepProgress } from "@/components/ui/step-progress";
import { api, ApiFailure } from "@/lib/api";
import { EMPTY_DATE, partsToIsoDate } from "@/lib/date-parts";
import { ButtonLink } from "@/components/ui/button-link";
import { PiPhoneBold } from "react-icons/pi";
import { usePending, useOnHide } from "@/lib/pending";
import { LanguageSwitch, useT } from "@/i18n/client";

function EmergencyButton() {
  const { t } = useT();
  return (
    <ButtonLink href="/emergency" variant="danger" size="compact" icon={<PiPhoneBold />}>
      {t.common.emergency}
    </ButtonLink>
  );
}

type Problem =
  | { kind: "locked"; until: string }
  | { kind: "unavailable" }
  | { kind: "ended" }
  | { kind: "other" }
  | null;

/**
 * One thing per page: first the ID, then the two facts
 * that prove it is you. Nothing is stored on the device.
 */
export function LoginFlow({ ended, other = false }: { ended: boolean; other?: boolean }) {
  const router = useRouter();
  const { t, tr, time } = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [id, setId] = useState("");
  const [dob, setDob] = useState(EMPTY_DATE);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem>(other ? { kind: "other" } : ended ? { kind: "ended" } : null);
  const [pending, setPending] = usePending(false);
  // Nothing typed here is kept once the screen is left.
  useOnHide(() => {
    setId("");
    setDob(EMPTY_DATE);
    setName("");
    setStep(1);
    setProblem(null);
    setErrors({});
  });

  function next(e: FormEvent) {
    e.preventDefault();
    const result = nationalIdSchema.safeParse(id);
    if (!result.success) return setErrors({ nationalId: tr(result.error.issues[0].message) });
    setErrors({});
    setProblem(null);
    setStep(2);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = patientLogin.safeParse({
      nationalId: id,
      dateOfBirth: partsToIsoDate(dob),
      name,
      sharedDevice: shared,
    });
    if (!result.success) {
      const f: Record<string, string> = {};
      for (const i of result.error.issues) f[String(i.path[0])] ??= tr(i.message);
      return setErrors(f);
    }
    setErrors({});
    setPending(true);
    try {
      await api("/auth/patient/login", result.data);
      router.replace("/home");
    } catch (err) {
      setPending(false);
      // No answer, or a server or gateway fault: the details may be right, so never say they don't match (FR 1.5).
      if (err instanceof TypeError) return setProblem({ kind: "unavailable" });
      if (!(err instanceof ApiFailure)) throw err;
      if (err.status >= 500) return setProblem({ kind: "unavailable" });
      const { code, message, until, fields } = err.error;
      if (code === "LOCKED" && until) return setProblem({ kind: "locked", until });
      if (code === "NIDA_UNAVAILABLE") return setProblem({ kind: "unavailable" });
      if (code !== "INVALID_CREDENTIALS") return setErrors({ form: tr(message) });
      const left = Number(fields?.attemptsLeft);
      // Warn before the lock, not after.
      const warning = left && left <= 2 ? ` ${t.login.triesLeft(left)}` : "";
      setErrors({ form: `${t.login.checkDetails}${warning}` });
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <div className="flex items-center justify-between">
        {step === 1 ? (
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-small font-medium text-fg">
            <PiArrowLeftBold className="size-5" aria-hidden />
            {t.common.back}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="-ml-2 inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-small font-medium text-fg"
          >
            <PiArrowLeftBold className="size-5" aria-hidden />
            {t.common.back}
          </button>
        )}
        <LanguageSwitch />
      </div>

      {step === 1 && (
        <div className="flex justify-center">
          <Logo variant="hero" height={48} />
        </div>
      )}

      <StepProgress current={step} total={2} text={t.common.step(step, 2)} />

      {problem?.kind === "other" && (
        <Notice tone="info" title={t.login.otherTitle}>
          {t.login.otherBody}
        </Notice>
      )}
      {problem?.kind === "ended" && (
        <Notice tone="info" title={t.login.endedTitle}>
          {t.login.endedBody}
        </Notice>
      )}
      {/* The lock shows the Emergency button */}
      {problem?.kind === "locked" && (
        <Notice tone="urgent" title={t.login.lockedTitle} action={<EmergencyButton />}>
          {t.login.lockedBody(time(problem.until))}
        </Notice>
      )}
      {/* The SRS wording, with the Emergency button */}
      {problem?.kind === "unavailable" && (
        <Notice tone="warning" title={t.login.unavailableTitle} action={<EmergencyButton />}>
          {t.login.unavailableBody}
        </Notice>
      )}

      {step === 1 ? (
        <form onSubmit={next} noValidate className="flex flex-1 flex-col gap-6">
          <h1 className="text-h1 text-fg">{t.login.idTitle}</h1>
          <Input
            label={t.login.idLabel}
            hint={t.login.idHint}
            leading={<PiIdentificationCardBold />}
            mono
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={id}
            onChange={(event) => setId(formatNationalId(event.target.value))}
            error={errors.nationalId}
          />
          <div className="flex-1" />
          <BottomBar>
            <Button type="submit" variant="primary" className="w-full sm:w-auto sm:self-start">
              {t.common.continue}
            </Button>
          </BottomBar>
        </form>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-h1 text-fg">{t.login.confirmTitle}</h1>
            <p className="text-body text-fg-secondary">
              {t.login.confirmIntro} <span className="font-mono font-medium text-fg">{id}</span>.
            </p>
          </div>
          {errors.form && (
            <Notice tone="urgent" title={t.login.noMatch}>
              {errors.form}
            </Notice>
          )}
          <DateInput label={t.login.dob} value={dob} onChange={setDob} error={errors.dateOfBirth} />
          <Input
            label={t.login.name}
            hint={t.login.nameHint}
            autoComplete="off"
            autoCapitalize="words"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
          />
          <div className="flex flex-col">
            {/* The SRS label */}
            <Checkbox label={t.login.shared} checked={shared} onChange={(event) => setShared(event.target.checked)} />
            <p className="pl-8 text-small text-fg-secondary">{t.login.sharedHint}</p>
          </div>
          <div className="flex-1" />
          <BottomBar>
            <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto sm:self-start">
              {pending ? t.login.checking : t.login.logIn}
            </Button>
          </BottomBar>
        </form>
      )}
    </main>
  );
}
