"use client";

import { formatPrescriptionCode } from "@ubuzima/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BottomBar } from "@/components/app/bottom-bar";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { LanguageSwitch, useT } from "@/i18n/client";

/** FR 11.7: type the code, or scan the QR code with any phone camera, which opens the result directly. */
export function CheckForm() {
  const router = useRouter();
  const { t } = useT();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^RX-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code)) return setError(t.check.badCode);
    router.push(`/check/${code}`);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <div className="flex items-center justify-between gap-3">
        <Logo href="/" variant="compact" />
        <LanguageSwitch />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t.check.title}</h1>
        <p className="text-body text-fg-secondary">{t.check.intro}</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-6">
        <Input
          label={t.check.label}
          hint={t.check.hint}
          mono
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(formatPrescriptionCode(e.target.value))}
          error={error}
        />
        <div className="flex-1" />
        <BottomBar>
          <Button type="submit" variant="primary" className="w-full sm:w-auto sm:self-start">
            {t.check.button}
          </Button>
        </BottomBar>
      </form>
    </main>
  );
}
