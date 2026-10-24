"use client";

import { formatPrescriptionCode, type PrescriptionStatus } from "@ubuzima/shared";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import { Logo } from "@/components/app/logo";
import { Medicines, type Prescription } from "@/components/app/prescription";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { useApi } from "@/lib/use-api";
import { LanguageSwitch, useT } from "@/i18n/client";

type Result =
  | { found: false }
  | { found: true; code: string; status: PrescriptionStatus; patient: string; items: Prescription["items"]; prescriber: { name: string; licence: string | null }; issuedAt: string; validUntil: string };

/**
 * FR 11.7: the answer a pharmacist needs first, as the biggest thing on the page: dispense or not.
 * Then the patient's name, medicines, prescriber and dates. Never the national ID or a diagnosis.
 */
export function CheckResult({ code }: { code: string }) {
  const clean = formatPrescriptionCode(code);
  const { t, tr, date, dateTime } = useT();
  const { data, error } = useApi<Result>(`/public/prescriptions/${clean}`);

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <div className="flex items-center justify-between gap-3">
        <Logo href="/" width={140} />
        <LanguageSwitch />
      </div>
      <Link href="/check" className="-ml-2 inline-flex min-h-11 w-fit items-center gap-2 px-2 text-small font-medium text-fg">
        <LuArrowLeft className="size-5" aria-hidden />
        {t.check.another}
      </Link>
      <p className="font-mono text-h3 font-semibold tracking-wide text-fg">{clean}</p>
      {error ? (
        <Notice tone="warning" title={t.check.couldnt}>
          {tr(error)}
        </Notice>
      ) : !data ? (
        <div className="h-48" aria-busy />
      ) : !data.found ? (
        <Notice tone="warning" title={t.check.notFound}>
          {t.check.notFoundBody}
        </Notice>
      ) : (
        <>
          {data.status === "VALID" ? (
            <Notice tone="success" title={t.check.valid}>
              {t.check.dispenseUntil(dateTime(data.validUntil))}
            </Notice>
          ) : (
            <Notice tone="urgent" title={t.check.dont}>
              {data.status === "CANCELLED" ? t.check.wasCancelled : t.check.expiredOn(date(data.validUntil))}
            </Notice>
          )}
          <Card className="flex flex-col gap-5">
            <dl className="grid gap-x-6 gap-y-3 text-small sm:grid-cols-[120px_1fr]">
              <dt className="text-fg-secondary">{t.check.patient}</dt>
              <dd className="text-body font-semibold text-fg">{data.patient}</dd>
              <dt className="text-fg-secondary">{t.check.prescriber}</dt>
              <dd className="text-fg">
                {data.prescriber.name}
                {data.prescriber.licence ? `, ${t.check.licence(data.prescriber.licence)}` : ""}
              </dd>
              <dt className="text-fg-secondary">{t.check.issued}</dt>
              <dd className="text-fg">{dateTime(data.issuedAt)}</dd>
            </dl>
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h2 className="text-small font-medium text-fg-secondary">{t.check.medicines}</h2>
              <Medicines items={data.items} />
            </div>
          </Card>
          <p className="text-caption text-fg-muted">{t.check.logged}</p>
        </>
      )}
    </main>
  );
}
