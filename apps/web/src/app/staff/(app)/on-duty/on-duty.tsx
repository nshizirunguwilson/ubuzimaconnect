"use client";

import { AGENT_STATUS_LABEL, type AgentStatus } from "@ubuzima/shared";
import { useEffect, useState } from "react";
import { PiWarningBold } from "react-icons/pi";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, type Tone } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { Loading } from "@/components/ui/loading";

type Data = {
  shift: "DAY" | "NIGHT";
  date: string;
  rows: { id: string; name: string; scheduled: boolean; status: AgentStatus; since: string; alert: boolean }[];
};

const TONE: Record<AgentStatus, Tone> = { AVAILABLE: "success", BUSY: "info", AWAY: "warning", OFFLINE: "neutral" };
const REFRESH_MS = 15_000;

/** How long ago this was: "just now", "12 min" or "2 h 5 min". */
function duration(iso: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/**
 * Every agent, whether they are on this shift, their status and for how long.
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

  if (!data) return <Loading className="h-96" />;
  const scheduled = data.rows.filter((row) => row.scheduled);
  const alerts = data.rows.filter((row) => row.alert).length;
  const ready = scheduled.filter((agent) => agent.status === "AVAILABLE" || agent.status === "BUSY").length;

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <PageHeader
        title="On duty"
        intro={`${data.shift === "DAY" ? "Day shift, 07:00 to 19:00" : "Night shift, 19:00 to 07:00"}. ${ready} of ${scheduled.length} scheduled agents are working.`}
      />
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
            {data.rows.map((agent) => (
              <tr key={agent.id} className={cn(agent.alert && "bg-urgent-soft")}>
                <td className="px-4 py-3 md:px-6">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    {agent.alert && (
                      <PiWarningBold className="size-4 shrink-0 text-urgent" aria-label="Scheduled but Offline" />
                    )}
                    {agent.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg-secondary max-sm:hidden">
                  {agent.scheduled ? "Scheduled" : "Not scheduled"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={TONE[agent.status]}>{AGENT_STATUS_LABEL[agent.status]}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-fg-secondary tabular-nums md:px-6">{duration(agent.since, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
