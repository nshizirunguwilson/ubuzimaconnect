"use client";

import { AGENT_STATUS_LABEL, CATEGORY_LABEL, SERVICE_LABEL, type AgentStatus, type Category, type Service } from "@ubuzima/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LuInbox, LuPhoneCall, LuTriangleAlert } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, TriageBadge, type TriageLevel } from "@/components/ui/status";
import { Squircle } from "@/components/ui/squircle";
import { Tab, Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useLive } from "@/lib/live";
import { useApi } from "@/lib/use-api";
import { usePending } from "@/lib/pending";

type Summary = {
  id: string;
  code: string;
  level: "URGENT" | "UNCERTAIN" | "MINOR";
  queuedAt: string;
  category: Category | null;
  service: Service | null;
  callRequested: boolean;
  sex: "FEMALE" | "MALE";
  age: string;
  redFlag: string | null;
};
type State = {
  status: AgentStatus;
  statusSince: string;
  active: { id: string; code: string } | null;
  offer: (Summary & { expiresAt: string }) | null;
  waiting: Summary[];
  level1Alert: boolean;
};

const LEVELS = ["URGENT", "UNCERTAIN", "MINOR"] as const;

/** Each status has its own colour and dot, so it reads at a glance (DESIGN.md §2: never colour alone, the word is there too). */
const STATUS_STYLE = {
  AVAILABLE: { on: "sq-bg-success-soft sq-border-success text-success-fg", dot: "bg-success", means: "Cases will be offered to you, one at a time. You have 30 seconds to accept each one." },
  AWAY: { on: "sq-bg-warning-soft sq-border-warning text-warning-fg", dot: "bg-warning", means: "You won't be offered new cases until you choose Available again." },
  OFFLINE: { on: "sq-bg-sunken sq-border-border-strong text-fg-secondary", dot: "bg-fg-muted", means: "You won't be offered cases. Use this at the end of your shift." },
} as const;
const triage = (l: Summary["level"]) => l.toLowerCase() as TriageLevel;
const minutes = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
const what = (c: Summary) =>
  [c.redFlag ? `Red flag ${c.redFlag}` : c.category ? CATEGORY_LABEL[c.category] : null, c.service ? SERVICE_LABEL[c.service] : null].filter(Boolean).join(" · ");

/**
 * FR 6.1 to 6.4 and RESEARCH R2: the agent's status, the case offered to them (30 seconds to accept),
 * and the waiting cases by level with counts. Waiting cases show no names (FR 9.2).
 */
export function Queue({ firstName }: { firstName: string }) {
  const router = useRouter();
  const { data, reload } = useApi<State>("/agent/state");
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = usePending<string | null>(null);
  const [ask, setAsk] = useState<"AVAILABLE" | "AWAY" | "OFFLINE" | null>(null);

  useLive("/events/agent", () => void reload(), () => void reload());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div className="h-96" aria-busy />;

  async function setStatus(status: "AVAILABLE" | "AWAY" | "OFFLINE") {
    setPending(status);
    try {
      await api("/agent/status", { status }, { method: "PUT" });
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.error.message : "Couldn't change your status.");
    } finally {
      setPending(null);
    }
  }

  async function accept(id: string) {
    setPending("accept");
    try {
      await api(`/agent/offers/${id}/accept`, {});
      router.push(`/staff/cases/${id}`);
    } catch (e) {
      setPending(null);
      toast.error(e instanceof ApiFailure ? e.error.message : "Couldn't accept.");
      await reload();
    }
  }

  const secondsLeft = data.offer ? Math.max(0, Math.ceil((new Date(data.offer.expiresAt).getTime() - now) / 1000)) : 0;
  const counts = Object.fromEntries(LEVELS.map((l) => [l, data.waiting.filter((c) => c.level === l).length])) as Record<Summary["level"], number>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Queue"
        intro={
          data.waiting.length === 0
            ? `Nothing is waiting right now, ${firstName}.`
            : `${data.waiting.length} ${data.waiting.length === 1 ? "case is" : "cases are"} waiting. Urgent first, then Uncertain, then Minor, oldest first.`
        }
      />

      {/* FR 6.1: Busy is set by the system while a case is open */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-small font-medium text-fg">Your status</span>
        {data.status === "BUSY" ? (
          <StatusBadge tone="info">Busy with a case</StatusBadge>
        ) : (
          <div role="radiogroup" aria-label="Your status" className="flex gap-1">
            {(["AVAILABLE", "AWAY", "OFFLINE"] as const).map((s) => (
              <Squircle
                key={s}
                as="button"
                type="button"
                role="radio"
                aria-checked={data.status === s}
                radius="md"
                focus="self"
                disabled={pending !== null}
                onClick={() => data.status !== s && setAsk(s)}
                className={cn(
                  "inline-flex h-10 cursor-pointer items-center gap-2 px-3.5 text-small font-medium",
                  data.status === s ? STATUS_STYLE[s].on : "sq-bg-surface sq-border-border-strong text-fg hover:sq-bg-sunken",
                )}
              >
                <span aria-hidden className={cn("size-2 rounded-full", STATUS_STYLE[s].dot)} />
                {AGENT_STATUS_LABEL[s]}
              </Squircle>
            ))}
          </div>
        )}
      </div>
      <Dialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
        {ask && (
          <DialogContent
            title={`Change to ${AGENT_STATUS_LABEL[ask]}?`}
            description={STATUS_STYLE[ask].means}
            actions={
              <>
                <Button variant="secondary" onClick={() => setAsk(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={pending === ask}
                  onClick={async () => {
                    await setStatus(ask);
                    setAsk(null);
                  }}
                >
                  Change to {AGENT_STATUS_LABEL[ask]}
                </Button>
              </>
            }
          />
        )}
      </Dialog>

      {data.active && (
        <Card highlighted className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-caption text-fg-muted">Your case</span>
            <span className="font-mono text-body font-semibold text-fg">{data.active.code}</span>
          </div>
          <ButtonLink href={`/staff/cases/${data.active.id}`} variant="primary">
            Open case
          </ButtonLink>
        </Card>
      )}

      {data.offer && (
        <Card highlighted className="flex flex-col gap-4" aria-live="assertive">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <TriageBadge level={triage(data.offer.level)} />
              <span className="font-mono text-small font-medium text-fg-secondary">{data.offer.code}</span>
            </div>
            <span className="text-small font-medium text-fg tabular-nums">{secondsLeft} s to accept</span>
          </div>
          <p className="text-body text-fg">
            {data.offer.sex === "FEMALE" ? "Female" : "Male"}, {data.offer.age}
            {what(data.offer) ? ` · ${what(data.offer)}` : ""}
            {data.offer.callRequested ? " · Call requested" : ""}
          </p>
          <div className="flex gap-3">
            <Button variant="primary" loading={pending === "accept"} onClick={() => accept(data.offer!.id)}>
              Accept case
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await api(`/agent/offers/${data.offer!.id}/decline`, {});
                await reload();
              }}
            >
              Not now
            </Button>
          </div>
        </Card>
      )}

      {data.level1Alert && data.status === "BUSY" && (
        <Notice tone="urgent" title="A case has waited more than 2 minutes">
          If your case is Minor or Uncertain, you can pause it from the case screen and take the urgent one.
        </Notice>
      )}

      {data.status !== "AVAILABLE" && data.status !== "BUSY" && data.waiting.length > 0 && (
        <Notice tone="info" title="You won't get offers while you are not Available" />
      )}

      <Card className="p-0 md:p-0">
        <Tabs defaultValue="URGENT">
          <TabsList className="px-4 md:px-6">
            {LEVELS.map((l) => (
              <Tab key={l} value={l} count={counts[l]}>
                {l === "URGENT" ? "Urgent" : l === "UNCERTAIN" ? "Uncertain" : "Minor"}
              </Tab>
            ))}
          </TabsList>
          {LEVELS.map((l) => {
            const rows = data.waiting.filter((c) => c.level === l);
            return (
              <TabsContent key={l} value={l} className="outline-none">
                {rows.length === 0 ? (
                  <EmptyState icon={LuInbox} message={`No ${l.toLowerCase()} cases waiting.`} />
                ) : (
                  <ul className="divide-y divide-border">
                    {rows.map((c) => {
                      const waited = minutes(c.queuedAt, now);
                      return (
                        <li key={c.id} className="flex items-center gap-3 px-4 py-3 md:px-6">
                          {c.level === "URGENT" ? (
                            <LuTriangleAlert className="size-5 shrink-0 text-urgent" aria-hidden />
                          ) : c.callRequested ? (
                            <LuPhoneCall className="size-5 shrink-0 text-fg-secondary" aria-hidden />
                          ) : (
                            <span className="size-5 shrink-0" aria-hidden />
                          )}
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-body font-semibold text-fg">
                              {c.sex === "FEMALE" ? "Female" : "Male"}, {c.age}
                            </span>
                            <span className="truncate text-small text-fg-secondary">
                              {[what(c), c.callRequested ? "Call requested" : null].filter(Boolean).join(" · ") || c.code}
                            </span>
                          </div>
                          <span
                            className={cn("shrink-0 text-small tabular-nums", waited >= 2 && l !== "MINOR" ? "font-semibold text-urgent-fg" : "text-fg-secondary")}
                            title={`Waiting since ${new Date(c.queuedAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Kigali" })}`}
                          >
                            {waited < 1 ? "Just now" : `${waited} min`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </Card>
    </div>
  );
}
