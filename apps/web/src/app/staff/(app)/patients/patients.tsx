"use client";

import { SERVICE_LABEL, type Service } from "@ubuzima/shared";
import Link from "next/link";
import { LuBedDouble, LuChevronRight, LuTriangleAlert, LuUsersRound } from "react-icons/lu";
import { Avatar } from "@/components/app/avatar";
import { NotifyToggle } from "@/components/app/notify-toggle";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, TriageBadge, type TriageLevel } from "@/components/ui/status";
import { useLive } from "@/lib/live";
import { formatTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";

type Level = "URGENT" | "UNCERTAIN" | "MINOR";
type Data = {
  onDuty: boolean;
  visits: {
    id: string;
    name: string;
    age: string;
    sex: "FEMALE" | "MALE";
    photoUrl: string | null;
    level: Level | null;
    service: Service;
    arrivedAt: string;
    hasBed: boolean;
    handedOver: boolean;
  }[];
  incoming: {
    id: string;
    level: Level | null;
    service: Service;
    bedHeld: boolean;
    redFlags: { code: string; text: string }[];
    description: string | null;
    age: string;
    sex: "FEMALE" | "MALE";
    attending: { name: string; me: boolean } | null;
    isNew: boolean;
    transferredFrom: string | null;
    sentAt: string;
  }[];
};

const sexAge = (p: { sex: "FEMALE" | "MALE"; age: string }) => `${p.sex === "FEMALE" ? "Female" : "Male"}, ${p.age}`;
const rowClass = "flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-sunken focus-visible:-outline-offset-2 md:px-6";

/**
 * FR 7.4: patients on their way to this facility, as a summary only, to every clinician on duty here.
 * FR 7.6: patients in my care open the full record. Both lists update live.
 */
export function Patients({ facility }: { facility: string | null }) {
  const { data, reload } = useApi<Data>("/clinician/patients");
  useLive(
    "/events/staff",
    () => void reload(),
    () => void reload(),
  );

  if (!data) return <div className="h-96" aria-busy />;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Patients" intro={facility ? `Patients in your care, and patients on their way to ${facility}.` : "Patients in your care."} />
      <NotifyToggle who="clinician" />

      <section className="flex flex-col gap-3" aria-labelledby="in-care">
        <h2 id="in-care" className="text-h3 text-fg">
          In your care <span className="font-normal text-fg-secondary">· {data.visits.length}</span>
        </h2>
        <Card className="p-0 md:p-0">
          {data.visits.length === 0 ? (
            <EmptyState icon={LuUsersRound} message="No patients in your care. When you mark a patient arrived, they appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {data.visits.map((v) => (
                <li key={v.id}>
                  <Link href={`/staff/visits/${v.id}`} className={rowClass}>
                    <Avatar src={v.photoUrl} name={v.name} size={40} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold text-fg">{v.name}</span>
                      <span className="truncate text-small text-fg-secondary">
                        {sexAge(v)} · {SERVICE_LABEL[v.service]} · arrived {formatTime(v.arrivedAt)}
                      </span>
                    </div>
                    {v.handedOver && <StatusBadge tone="info">Handed over to you</StatusBadge>}
                    {v.hasBed && (
                      <StatusBadge tone="neutral" icon={<LuBedDouble aria-hidden />} className="max-sm:hidden">
                        Bed
                      </StatusBadge>
                    )}
                    <LuChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="incoming">
        <h2 id="incoming" className="text-h3 text-fg">
          On the way <span className="font-normal text-fg-secondary">· {data.incoming.length}</span>
        </h2>
        {!data.onDuty ? (
          <Notice tone="info" title="You're not on duty now">
            Patients on their way show here during your shifts.
          </Notice>
        ) : (
          <Card className="p-0 md:p-0">
            {data.incoming.length === 0 ? (
              <EmptyState icon={LuUsersRound} message="Nobody is on the way right now." />
            ) : (
              <ul className="divide-y divide-border">
                {data.incoming.map((p) => (
                  <li key={p.id}>
                    <Link href={`/staff/incoming/${p.id}`} className={rowClass}>
                      {p.level === "URGENT" ? (
                        <LuTriangleAlert className="size-5 shrink-0 text-urgent" aria-hidden />
                      ) : (
                        <span className="size-5 shrink-0" aria-hidden />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2 truncate text-body font-semibold text-fg">
                          {sexAge(p)}
                          {p.isNew && <StatusBadge tone="info">New</StatusBadge>}
                        </span>
                        <span className="truncate text-small text-fg-secondary">
                          {[
                            SERVICE_LABEL[p.service],
                            p.redFlags[0] ? `Red flag ${p.redFlags[0].code}` : p.description,
                            p.attending ? (p.attending.me ? "Yours" : p.attending.name) : "No clinician assigned",
                            p.transferredFrom ? "Transfer" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      {p.level && <TriageBadge level={p.level.toLowerCase() as TriageLevel} className="max-sm:hidden" />}
                      <span className="shrink-0 text-small text-fg-secondary tabular-nums" title="When the facility was given">
                        {formatTime(p.sentAt)}
                      </span>
                      <LuChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
