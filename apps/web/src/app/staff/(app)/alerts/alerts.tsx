"use client";

import { LuBell } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type Tone } from "@/components/ui/status";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLive } from "@/lib/live";
import { formatDateTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";

type Kind = "ESCALATION" | "DELAY_INCIDENT" | "NO_AGENT" | "NO_CAPACITY" | "AI_FAILURES";
type Data = {
  unread: number;
  alerts: { id: string; kind: Kind; message: string; emailed: boolean; read: boolean; at: string; case: { code: string; status: string } | null }[];
};

const KIND: Record<Kind, { label: string; tone: Tone }> = {
  DELAY_INCIDENT: { label: "Delay incident", tone: "urgent" },
  ESCALATION: { label: "Waiting 2 min", tone: "warning" },
  NO_AGENT: { label: "No agent online", tone: "urgent" },
  NO_CAPACITY: { label: "No capacity", tone: "warning" },
  AI_FAILURES: { label: "AI failing", tone: "warning" },
};

/** FR 12.7: escalations, no agent online, no-capacity events and AI failures, newest first, live. */
export function Alerts() {
  const { data, reload } = useApi<Data>("/alerts");
  useLive("/events/staff", (e) => e.type === "admin-alert" && void reload(), () => void reload());
  if (!data) return <div className="h-96" aria-busy />;

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <PageHeader
        title="Alerts"
        intro={data.unread ? `${data.unread} new. Delay incidents and long stretches with no agent online are also emailed to you.` : "Nothing new. Serious alerts are also emailed to you."}
        action={
          data.unread > 0 && (
            <Button
              variant="secondary"
              onClick={async () => {
                await api("/alerts/read", {});
                await reload();
              }}
            >
              Mark all as read
            </Button>
          )
        }
      />
      <Card className="p-0 md:p-0">
        {data.alerts.length === 0 ? (
          <EmptyState icon={LuBell} message="No alerts yet." />
        ) : (
          <ul className="divide-y divide-border">
            {data.alerts.map((a) => (
              <li key={a.id} className={cn("flex flex-col gap-1.5 px-4 py-3 md:px-6", !a.read && "bg-accent-soft")}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={KIND[a.kind].tone}>{KIND[a.kind].label}</StatusBadge>
                  <span className="text-small text-fg-secondary tabular-nums">{formatDateTime(a.at)}</span>
                  {a.emailed && <span className="text-caption text-fg-muted">Emailed</span>}
                </div>
                <p className="text-body text-fg">{a.message}</p>
                {a.case && <p className="text-small text-fg-secondary">{a.case.status === "ASSIGNED" || a.case.status === "CLOSED" ? "Now taken by an agent." : "Still waiting."}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
