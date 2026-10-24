"use client";

import { formatNationalId, nationalId as nationalIdSchema, patientLogin } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LuArrowLeft, LuIdCard } from "react-icons/lu";
import { BottomBar } from "@/components/app/bottom-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StepProgress } from "@/components/ui/step-progress";
import { api, ApiFailure } from "@/lib/api";
import { ButtonLink } from "@/components/ui/button-link";
import { LuPhone } from "react-icons/lu";
import { usePending, useOnHide } from "@/lib/pending";
import { LanguageSwitch, useT } from "@/i18n/client";

function EmergencyButton() {
  const { t } = useT();
  return (
    <ButtonLink href="/emergency" variant="danger" size="compact" icon={<LuPhone />}>
      {t.common.emergency}
    </ButtonLink>
  );
}

type Problem = { kind: "locked"; until: string } | { kind: "unavailable" } | { kind: "ended" } | null;

/**
 * FR 1.1 to 1.8, one thing per page (RESEARCH §2.1): first the ID, then the two facts
 * that prove it is you. Nothing is stored on the device.
 */
export function LoginFlow({ ended }: { ended: boolean }) {
  const router = useRouter();
  const { t, tr, time } = useT();
  const [step, setStep] = useState<1 | 2>(1);
  const [id, setId] = useState("");
  const [dob, setDob] = useState("");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Problem>(ended ? { kind: "ended" } : null);
  const [pending, setPending] = usePending(false);
  // Nothing typed here is kept once the screen is left.
  useOnHide(() => {
    setId("");
    setDob("");
    setName("");
    setStep(1);
    setProblem(null);
    setErrors({});
  });

  function next(e: FormEvent) {
    e.preventDefault();
    const r = nationalIdSchema.safeParse(id);
    if (!r.success) return setErrors({ nationalId: tr(r.error.issues[0].message) });
    setErrors({});
    setProblem(null);
    setStep(2);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = patientLogin.safeParse({ nationalId: id, dateOfBirth: dob, name, sharedDevice: shared });
    if (!r.success) {
      const f: Record<string, string> = {};
      for (const i of r.error.issues) f[String(i.path[0])] ??= tr(i.message);
      return setErrors(f);
    }
    setErrors({});
    setPending(true);
    try {
      await api("/auth/patient/login", r.data);
      router.replace("/home");
    } catch (err) {
      setPending(false);
      if (!(err instanceof ApiFailure)) throw err;
      const { code, message, until, fields } = err.error;
      if (code === "LOCKED" && until) return setProblem({ kind: "locked", until });
      if (code === "NIDA_UNAVAILABLE") return setProblem({ kind: "unavailable" });
      if (code !== "INVALID_CREDENTIALS") return setErrors({ form: tr(message) });
      const left = Number(fields?.attemptsLeft);
      // Warn before the lock, not after (FR 1.6).
      const warning = left && left <= 2 ? ` ${t.login.triesLeft(left)}` : "";
      setErrors({ form: `${t.login.checkDetails}${warning}` });
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <div className="flex items-center justify-between">
        {step === 1 ? (
          <Link href="/" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-small font-medium text-fg">
            <LuArrowLeft className="size-5" aria-hidden />
            {t.common.back}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="-ml-2 inline-flex min-h-11 cursor-pointer items-center gap-2 px-2 text-small font-medium text-fg"
          >
            <LuArrowLeft className="size-5" aria-hidden />
            {t.common.back}
          </button>
        )}
        <LanguageSwitch />
      </div>

      <StepProgress current={step} total={2} text={t.common.step(step, 2)} />

      {problem?.kind === "ended" && (
        <Notice tone="info" title={t.login.endedTitle}>
          {t.login.endedBody}
        </Notice>
      )}
      {/* FR 1.6: the lock shows the Emergency button */}
      {problem?.kind === "locked" && (
        <Notice tone="urgent" title={t.login.lockedTitle} action={<EmergencyButton />}>
          {t.login.lockedBody(time(problem.until))}
        </Notice>
      )}
      {/* FR 1.5: the SRS wording, with the Emergency button */}
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
            leading={<LuIdCard />}
            mono
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={id}
            onChange={(e) => setId(formatNationalId(e.target.value))}
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
          <Input
            label={t.login.dob}
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            error={errors.dateOfBirth}
          />
          <Input
            label={t.login.name}
            hint={t.login.nameHint}
            autoComplete="off"
            autoCapitalize="words"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
          <div className="flex flex-col">
            {/* FR 1.8: the SRS label */}
            <Checkbox label={t.login.shared} checked={shared} onChange={(e) => setShared(e.target.checked)} />
            <p className="pl-8 text-small text-fg-secondary">
              {t.login.sharedHint}
            </p>
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
