"use client";

import { PiPrinterBold } from "react-icons/pi";
import { PrintLogo } from "@/components/app/logo";
import { BackLink } from "@/components/patient/back-link";
import { Button } from "@/components/ui/button";
import type { Records } from "../load";
import { useT } from "@/i18n/client";

/**
 * A printable summary. The browser's own Print turns it into paper or a PDF on any device,
 * so nothing is generated on the server and no file is stored. Plain black text on white, A4 friendly.
 */
export function PrintSummary({ data }: { data: Records }) {
  const { t, date, dateTime } = useT();
  const person = data.person;
  const visits = data.cases.flatMap((found) => found.visits);
  return (
    <main className="flex flex-col gap-6 text-fg lg:mx-auto lg:w-full lg:max-w-[720px] print:max-w-none print:gap-4 print:text-black">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/records/${person.id}`} label={t.records.title} />
        <Button variant="primary" icon={<PiPrinterBold />} onClick={() => window.print()}>
          {t.print.button}
        </Button>
      </div>

      <header className="flex flex-col gap-1 border-b border-gray-900 pb-3">
        <PrintLogo />
        <p className="text-small font-semibold">{t.print.heading}</p>
        <h1 className="text-h1">{person.name}</h1>
        <p className="text-small">
          {t.print.born(date(person.dateOfBirth))} · {t.records.sex(person.sex === "FEMALE")}
          {person.district ? ` · ${t.home.district(person.district)}` : ""} · {t.print.printed(dateTime(new Date()))}
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
              {data.prescriptions.map((issued) => (
                <tr key={issued.id} className="border-b border-gray-200 align-top break-inside-avoid">
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {date(issued.issuedAt)}
                    <br />
                    <span className="font-mono text-caption">{issued.code}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {issued.items.map((it, i) => (
                      <div key={i}>
                        {it.medicine}: {t.prescription.dose(it.dose, it.frequency, it.days)}
                      </div>
                    ))}
                  </td>
                  <td className="py-1.5 pr-3">{issued.prescriber.name}</td>
                  <td className="py-1.5">{t.print.statuses[issued.status]}</td>
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
          visits.map((visit) => (
            <div key={visit.id} className="flex flex-col gap-1 break-inside-avoid text-small">
              <p className="font-semibold">
                {visit.facility} · {date(visit.arrivedAt)}
                {visit.endedAt ? t.print.to(date(visit.endedAt)) : ` ${t.print.inCare}`}
              </p>
              {visit.entries.map((entry) => (
                <p key={entry.id}>
                  {[
                    entry.diagnosis && `${t.records.diagnosis}: ${entry.diagnosis}`,
                    entry.treatment && `${t.records.treatment}: ${entry.treatment}`,
                    entry.notes,
                  ]
                    .filter(Boolean)
                    .join(". ")}{" "}
                  ({entry.by})
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
            {data.cases.map((found) => (
              <li key={found.id}>
                {date(found.createdAt)} · {found.code} ·{" "}
                {found.outcome ? t.records.outcomes[found.outcome] : t.records.open}
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
