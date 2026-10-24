"use client";

import { AGENT_STATUS_LABEL, type AgentStatus } from "@ubuzima/shared";
import { useEffect, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, type Tone } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";

type Data = { shift: "DAY" | "NIGHT"; date: string; rows: { id: string; name: string; scheduled: boolean; status: AgentStatus; since: string; alert: boolean }[] };

const TONE: Record<AgentStatus, Tone> = { AVAILABLE: "success", BUSY: "info", AWAY: "warning", OFFLINE: "neutral" };
const REFRESH_MS = 15_000;

const duration = (iso: string, now: number) => {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/**
 * FR 12.5: every agent, whether they are on this shift, their status and for how long.
 * Agents scheduled now but Offline come first, in red. Refreshes every 15 seconds.
 */
export function OnDuty() {
  const { data, reload } = useApi<Data>("/on-duty");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      void reload();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  if (!data) return <div className="h-96" aria-busy />;
  const scheduled = data.rows.filter((r) => r.scheduled);
  const alerts = data.rows.filter((r) => r.alert).length;
  const ready = scheduled.filter((r) => r.status === "AVAILABLE" || r.status === "BUSY").length;

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <PageHeader title="On duty" intro={`${data.shift === "DAY" ? "Day shift, 07:00 to 19:00" : "Night shift, 19:00 to 07:00"}. ${ready} of ${scheduled.length} scheduled agents are working.`} />
      {alerts > 0 && (
        <Notice tone="urgent" title={`${alerts} scheduled ${alerts === 1 ? "agent is" : "agents are"} Offline`}>
          Cases may wait longer. Call them or find cover.
        </Notice>
      )}
      <Card className="p-0 md:p-0">
        <table className="w-full text-left text-small">
          <thead className="text-fg-secondary">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium md:px-6">Agent</th>
              <th className="px-4 py-3 font-medium max-sm:hidden">This shift</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium md:px-6">For</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.rows.map((r) => (
              <tr key={r.id} className={cn(r.alert && "bg-urgent-soft")}>
                <td className="px-4 py-3 md:px-6">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    {r.alert && <LuTriangleAlert className="size-4 shrink-0 text-urgent" aria-label="Scheduled but Offline" />}
                    {r.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg-secondary max-sm:hidden">{r.scheduled ? "Scheduled" : "Not scheduled"}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={TONE[r.status]}>{AGENT_STATUS_LABEL[r.status]}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-fg-secondary tabular-nums md:px-6">{duration(r.since, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
