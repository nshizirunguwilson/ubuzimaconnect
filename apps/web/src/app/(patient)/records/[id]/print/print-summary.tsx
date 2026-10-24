"use client";

import { LuPrinter } from "react-icons/lu";
import { BackLink } from "@/components/patient/back-link";
import { Button } from "@/components/ui/button";
import type { Records } from "../load";
import { useT } from "@/i18n/client";

/**
 * FR 7.2: a printable summary. The browser's own Print turns it into paper or a PDF on any device,
 * so nothing is generated on the server and no file is stored. Plain black text on white, A4 friendly.
 */
export function PrintSummary({ data }: { data: Records }) {
  const { t, date, dateTime } = useT();
  const p = data.person;
  const visits = data.cases.flatMap((c) => c.visits);
  return (
    <main className="flex flex-col gap-6 text-fg lg:mx-auto lg:w-full lg:max-w-[720px] print:max-w-none print:gap-4 print:text-black">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/records/${p.id}`} label={t.records.title} />
        <Button variant="primary" icon={<LuPrinter />} onClick={() => window.print()}>
          {t.print.button}
        </Button>
      </div>

      <header className="flex flex-col gap-1 border-b border-gray-900 pb-3">
        <p className="text-small font-semibold">{t.print.heading}</p>
        <h1 className="text-h1">{p.name}</h1>
        <p className="text-small">
          {t.print.born(date(p.dateOfBirth))} · {t.records.sex(p.sex === "FEMALE")}
          {p.district ? ` · ${t.home.district(p.district)}` : ""} · {t.print.printed(dateTime(new Date()))}
        </p>
      </header>

      <Section title={t.records.prescriptions}>
        {data.prescriptions.length === 0 ? (
          <p className="text-small">{t.print.none}</p>
        ) : (
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="border-b border-gray-400 text-left">
                <th className="py-1 pr-3 font-semibold">{t.print.issued}</th>
                <th className="py-1 pr-3 font-semibold">{t.print.medicines}</th>
                <th className="py-1 pr-3 font-semibold">{t.print.prescriber}</th>
                <th className="py-1 font-semibold">{t.print.status}</th>
              </tr>
            </thead>
            <tbody>
              {data.prescriptions.map((x) => (
                <tr key={x.id} className="border-b border-gray-200 align-top break-inside-avoid">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {date(x.issuedAt)}
                    <br />
                    <span className="font-mono text-caption">{x.code}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {x.items.map((it, i) => (
                      <div key={i}>
                        {it.medicine}: {t.prescription.dose(it.dose, it.frequency, it.days)}
                      </div>
                    ))}
                  </td>
                  <td className="py-1.5 pr-3">{x.prescriber.name}</td>
                  <td className="py-1.5">{t.print.statuses[x.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={t.records.visits}>
        {visits.length === 0 ? (
          <p className="text-small">{t.print.none}</p>
        ) : (
          visits.map((v) => (
            <div key={v.id} className="flex flex-col gap-1 break-inside-avoid text-small">
              <p className="font-semibold">
                {v.facility} · {date(v.arrivedAt)}
                {v.endedAt ? t.print.to(date(v.endedAt)) : ` ${t.print.inCare}`}
              </p>
              {v.entries.map((e) => (
                <p key={e.id}>
                  {[e.diagnosis && `${t.records.diagnosis}: ${e.diagnosis}`, e.treatment && `${t.records.treatment}: ${e.treatment}`, e.notes].filter(Boolean).join(". ")} ({e.by})
                </p>
              ))}
            </div>
          ))
        )}
      </Section>

      <Section title={t.records.requests}>
        {data.cases.length === 0 ? (
          <p className="text-small">{t.print.none}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-small">
            {data.cases.map((c) => (
              <li key={c.id}>
                {date(c.createdAt)} · {c.code} · {c.outcome ? t.records.outcomes[c.outcome] : t.records.open}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <p className="text-caption text-fg-muted print:text-black">{t.print.noId}</p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-h3">{title}</h2>
      {children}
    </section>
  );
}
