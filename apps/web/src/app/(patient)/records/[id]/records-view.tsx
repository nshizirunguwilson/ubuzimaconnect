"use client";

import { LuHistory, LuPrinter } from "react-icons/lu";
import { Avatar } from "@/components/app/avatar";
import { PrescriptionCard } from "@/components/app/prescription";
import { BackLink } from "@/components/patient/back-link";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import type { Records } from "./load";
import { useT } from "@/i18n/client";

/**
 * Everything kept about one person, at any time: prescriptions (expired ones too),
 * visits with what the clinicians wrote, and every request for help. Valid prescriptions show their
 * QR code first, because that is what a pharmacy scans.
 */
export function RecordsView({ data }: { data: Records }) {
  const { t, date, dateTime } = useT();
  const person = data.person;
  const visits = data.cases.flatMap((found) => found.visits.map((visit) => ({ ...visit, code: found.code })));
  const valid = data.prescriptions.filter((prescription) => prescription.status === "VALID");
  const past = data.prescriptions.filter((prescription) => prescription.status !== "VALID");
  return (
    <main className="flex flex-1 flex-col gap-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
      <BackLink href="/home" label={t.common.home} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar src={person.photoUrl} name={person.name} size={56} />
          <div className="flex flex-col gap-0.5">
            <h1 className="text-h1 text-fg">{person.name}</h1>
            <p className="text-small text-fg-secondary">
              {t.records.sexAge(person.sex === "FEMALE", t.records.age(person.age), date(person.dateOfBirth))}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`/records/${person.id}/activity`} variant="secondary" size="compact" icon={<LuHistory />}>
            {t.records.activity}
          </ButtonLink>
          <ButtonLink href={`/records/${person.id}/print`} variant="secondary" size="compact" icon={<LuPrinter />}>
            {t.records.print}
          </ButtonLink>
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="rx">
        <h2 id="rx" className="text-h2 text-fg">
          {t.records.prescriptions}
        </h2>
        {data.prescriptions.length === 0 && <p className="text-body text-fg-secondary">{t.records.noPrescriptions}</p>}
        {valid.length > 0 && <p className="text-small text-fg-secondary">{t.records.showCode}</p>}
        {valid.map((prescription) => (
          <PrescriptionCard key={prescription.id} prescription={prescription} qr />
        ))}
        {past.map((prescription) => (
          <PrescriptionCard key={prescription.id} prescription={prescription} />
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="visits">
        <h2 id="visits" className="text-h2 text-fg">
          {t.records.visits}
        </h2>
        {visits.length === 0 && <p className="text-body text-fg-secondary">{t.records.noVisits}</p>}
        {visits.map((visit) => (
          <Card key={visit.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-body font-semibold text-fg">{visit.facility}</span>
                <span className="text-caption text-fg-muted">
                  {t.records.arrived(dateTime(visit.arrivedAt))}
                  {visit.endedAt ? ` · ${t.records.ended(dateTime(visit.endedAt))}` : ""}
                </span>
              </div>
              <StatusBadge tone={visit.status === "ARRIVED" ? "info" : "neutral"}>
                {t.records.visitStatus[visit.status] ?? visit.status}
              </StatusBadge>
            </div>
            {visit.entries.length === 0 ? (
              <p className="text-small text-fg-secondary">{t.records.nothingWritten}</p>
            ) : (
              visit.entries.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-1 border-t border-border pt-3 text-small">
                  <span className="text-caption text-fg-muted">
                    {entry.by} · {dateTime(entry.at)}
                  </span>
                  {entry.diagnosis && (
                    <p>
                      <span className="text-fg-secondary">{t.records.diagnosis}: </span>
                      <span className="text-fg">{entry.diagnosis}</span>
                    </p>
                  )}
                  {entry.treatment && (
                    <p>
                      <span className="text-fg-secondary">{t.records.treatment}: </span>
                      <span className="text-fg">{entry.treatment}</span>
                    </p>
                  )}
                  {entry.notes && <p className="whitespace-pre-wrap text-fg">{entry.notes}</p>}
                </div>
              ))
            )}
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="requests">
        <h2 id="requests" className="text-h2 text-fg">
          {t.records.requests}
        </h2>
        {data.cases.length === 0 ? (
          <p className="text-body text-fg-secondary">{t.records.noRequests}</p>
        ) : (
          <Card className="p-0 md:p-0">
            <ul className="divide-y divide-border">
              {data.cases.map((found) => (
                <li key={found.id} className="flex flex-col gap-0.5 px-4 py-3 md:px-6">
                  <span className="text-body font-semibold text-fg">
                    {date(found.createdAt)} · {found.outcome ? t.records.outcomes[found.outcome] : t.records.open}
                  </span>
                  <span className="font-mono text-caption text-fg-muted">{found.code}</span>
                  {found.description && <span className="text-small text-fg-secondary">“{found.description}”</span>}
                  {found.closingNote && found.outcome !== "CANCELLED_BY_PATIENT" && (
                    <span className="text-small text-fg-secondary">{found.closingNote}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </main>
  );
}
