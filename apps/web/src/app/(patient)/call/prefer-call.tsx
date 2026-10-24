"use client";

import { callRequest, homeCallRequest, PHONE_OWNERS } from "@ubuzima/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BottomBar } from "@/components/app/bottom-bar";
import { BackLink } from "@/components/patient/back-link";
import { Button } from "@/components/ui/button";
import { ChoiceRow } from "@/components/ui/choice";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { usePending } from "@/lib/pending";
import { useT } from "@/i18n/client";

type Owner = (typeof PHONE_OWNERS)[number];

/**
 * FR 3.8, 3.9: for people who can't read or type well (NFR 7). The only place a phone number is
 * asked, and it is kept for this request only.
 */
export function PreferCall({ caseId, people }: { caseId: string | null; people: { id: string; label: string }[] }) {
  const router = useRouter();
  const { t, tr } = useT();
  const [who, setWho] = useState(people.length === 1 ? people[0].id : "");
  const [number, setNumber] = useState("");
  const [owner, setOwner] = useState<Owner | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = usePending(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = caseId
      ? check(callRequest, { number, owner: owner || undefined })
      : check(homeCallRequest, { number, owner: owner || undefined, subjectId: who || undefined });
    if (!r.data) {
      const e = Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [k, tr(v)]));
      return setErrors({ ...e, ...(r.errors.subjectId ? { subjectId: t.call.chooseWho } : {}) });
    }
    setErrors({});
    setPending(true);
    try {
      const res = await api<{ id: string }>(caseId ? `/cases/${caseId}/call` : "/cases/call", r.data);
      router.replace(`/cases/${caseId ?? res.id}`);
    } catch (err) {
      setPending(false);
      setErrors(err instanceof ApiFailure ? (err.error.fields ?? { form: tr(err.error.message) }) : { form: t.common.couldntSend });
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <BackLink href={caseId ? `/cases/${caseId}` : "/home"} />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t.call.title}</h1>
        <p className="text-body text-fg-secondary">{t.call.intro}</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-8">
        {!caseId && people.length > 1 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-small font-medium text-fg">{t.call.whoNeedsHelp}</legend>
            {people.map((p) => (
              <ChoiceRow key={p.id} name="who" value={p.id} label={p.label} checked={who === p.id} onChange={() => setWho(p.id)} />
            ))}
            {errors.subjectId && <p className="text-small font-medium text-urgent-fg">{errors.subjectId}</p>}
          </fieldset>
        )}
        <Input label={t.call.number} type="tel" inputMode="tel" autoComplete="tel" value={number} onChange={(e) => setNumber(e.target.value)} error={errors.number} placeholder="0788 123 456" />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium text-fg">{t.call.whose}</legend>
          {PHONE_OWNERS.map((o) => (
            <ChoiceRow key={o} name="owner" value={o} label={t.call.owners[o]} checked={owner === o} onChange={() => setOwner(o)} />
          ))}
          {errors.owner && <p className="text-small font-medium text-urgent-fg">{errors.owner}</p>}
        </fieldset>
        {errors.form && <Notice tone="urgent" title={errors.form} />}
        <BottomBar>
          <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto sm:self-start">
            {t.call.ask}
          </Button>
        </BottomBar>
      </form>
    </main>
  );
}
