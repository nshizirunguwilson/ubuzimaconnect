"use client";

import { addDays, SERVICE_LABEL, SHIFT_HOURS, SHIFT_LABEL, SHIFTS, type Service, type ShiftType } from "@ubuzima/shared";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuChevronLeft, LuChevronRight, LuCircleCheck, LuCircleHelp, LuCopy } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Squircle } from "@/components/ui/squircle";
import { Tab, Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";

export type Week = {
  monday: string;
  days: string[];
  now: { date: string; shift: ShiftType };
  people: { id: string; name: string; specialty: Service | null }[];
  assignments: { id: string; staffId: string; date: string; shift: ShiftType; unavailable: boolean; unavailableReason: string | null }[];
  gaps: { date: string; shift: ShiftType; missing: (Service | "AGENT")[] }[];
};

const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
const range = (days: string[]) => {
  const f = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  return `${f(days[0], { day: "numeric", month: "short" })} – ${f(days[6], { day: "numeric", month: "short", year: "numeric" })}`;
};

// FullCalendar reads the window, so it loads in the browser only, and only for this page.
const ScheduleCalendar = dynamic(() => import("./schedule-calendar").then((m) => m.ScheduleCalendar), {
  ssr: false,
  loading: () => <div className="h-96" aria-busy />,
});

/**
 * FR 8.4 (clinicians, by the facility manager) and FR 12.4 (agents, by the administrator):
 * a week of Day and Night shifts, as a calendar (D77) or as a table. Gaps are shown per shift.
 */
export function Schedule({ scope }: { scope: "agents" | "clinicians" }) {
  const [week, setWeek] = useState<string | null>(null);
  const { data, reload } = useApi<Week>(`/schedule${week ? `?week=${week}` : ""}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  if (!data) return <div className="h-96" aria-busy />;

  const isPast = (date: string, shift: ShiftType) =>
    date < data.now.date || (date === data.now.date && shift === "DAY" && data.now.shift === "NIGHT");
  const gapShifts = data.gaps.filter((g) => g.missing.length > 0 && !isPast(g.date, g.shift));

  async function toggle(staffId: string, date: string, shift: ShiftType, assigned: boolean) {
    const key = `${staffId}${date}${shift}`;
    setBusy(key);
    try {
      await api("/schedule", { staffId, date, shift, assigned }, { method: "PUT" });
      await reload();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.error.message : "Couldn't change the shift. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function copyLastWeek() {
    setCopying(true);
    try {
      const { added } = await api<{ added: number }>("/schedule/copy", { week: data!.monday });
      await reload();
      if (added) toast.success(`Copied ${added} ${added === 1 ? "shift" : "shifts"} from last week`);
      else toast.success("Nothing new to copy: last week's shifts are already here, or these days have passed.");
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.error.message : "Couldn't copy last week. Try again.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={scope === "agents" ? "Agent schedule" : "Clinician schedule"}
        intro={`Day ${SHIFT_HOURS.DAY}, Night ${SHIFT_HOURS.NIGHT}.${scope === "agents" ? " At least one agent must be on every shift." : ""}`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-heading text-h3 font-semibold text-fg">{range(data.days)}</p>
        <div className="flex flex-wrap gap-2">
          {!isPast(data.days[6], "NIGHT") && (
            <Button variant="secondary" size="compact" icon={<LuCopy />} loading={copying} onClick={copyLastWeek}>
              Copy last week
            </Button>
          )}
          <Button variant="secondary" size="icon" aria-label="Previous week" onClick={() => setWeek(addDays(data.monday, -7))}>
            <LuChevronLeft />
          </Button>
          <Button variant="secondary" size="compact" onClick={() => setWeek(null)}>
            This week
          </Button>
          <Button variant="secondary" size="icon" aria-label="Next week" onClick={() => setWeek(addDays(data.monday, 7))}>
            <LuChevronRight />
          </Button>
        </div>
      </div>

      {gapShifts.length > 0 ? (
        <Notice tone="warning" title={`${gapShifts.length} upcoming ${gapShifts.length === 1 ? "shift has" : "shifts have"} a gap`}>
          {scope === "agents"
            ? "No agent is on these shifts. Patients would wait with nobody to answer."
            : "These shifts have no clinician for a service your facility offers, so patients needing it can't be routed here."}
        </Notice>
      ) : (
        <Notice tone="success" title="Every upcoming shift is covered" />
      )}

      <Tabs defaultValue="calendar" className="flex flex-col gap-4">
        <TabsList aria-label="Schedule view">
          <Tab value="calendar">Calendar</Tab>
          <Tab value="table">Table</Tab>
        </TabsList>
        <TabsContent value="calendar" className="flex flex-col gap-3">
          <ScheduleCalendar data={data} scope={scope} isPast={isPast} setShift={toggle} />
        </TabsContent>
        <TabsContent value="table" className="flex flex-col gap-3">
          <ScheduleTable data={data} scope={scope} isPast={isPast} busy={busy} toggle={toggle} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The same week as a table: every shift is a button, so it works with a keyboard and a screen reader. */
function ScheduleTable({
  data,
  scope,
  isPast,
  busy,
  toggle,
}: {
  data: Week;
  scope: "agents" | "clinicians";
  isPast: (date: string, shift: ShiftType) => boolean;
  busy: string | null;
  toggle: (staffId: string, date: string, shift: ShiftType, assigned: boolean) => Promise<boolean>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const cell = (staffId: string, date: string, shift: ShiftType) =>
    data.assignments.find((a) => a.staffId === staffId && a.date === date && a.shift === shift);

  // On narrow screens the grid scrolls sideways: open it at today, not Monday.
  const today = data.days.includes(data.now.date) ? data.now.date : null;
  useEffect(() => {
    const el = scroller.current;
    const th = el?.querySelector<HTMLElement>("[data-today]");
    const sticky = el?.querySelector<HTMLElement>("thead th");
    if (el && th && sticky && el.scrollWidth > el.clientWidth) el.scrollLeft = th.offsetLeft - sticky.offsetWidth;
  }, [today, data.monday]);

  return (
    <>
      <Card className="overflow-hidden p-0 md:p-0">
        <div ref={scroller} className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-small">
            <thead>
              <tr className="border-b border-border">
                <th rowSpan={2} className="sticky left-0 z-10 w-36 bg-surface sm:w-52 px-4 py-2 text-left align-bottom text-caption font-medium text-fg-muted">
                  {scope === "agents" ? "Agent" : "Clinician"}
                </th>
                {data.days.map((d) => (
                  <th key={d} colSpan={2} data-today={d === data.now.date || undefined} className={cn("px-1 pt-2 text-center text-caption font-medium", d === data.now.date ? "text-fg" : "text-fg-muted")}>
                    {d === data.now.date ? `Today, ${dayName(d)}` : dayName(d)}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border">
                {data.days.flatMap((d) =>
                  SHIFTS.map((s) => (
                    <th key={d + s} className="px-1 pb-2 text-center text-caption font-normal text-fg-muted">
                      {SHIFT_LABEL[s]}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.people.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 max-w-36 bg-surface px-4 py-2 text-left font-normal sm:max-w-52">
                    <span className="block font-semibold text-fg sm:truncate">{p.name}</span>
                    {p.specialty && <span className="block text-caption text-fg-secondary sm:truncate">{SERVICE_LABEL[p.specialty]}</span>}
                  </th>
                  {data.days.flatMap((d) =>
                    SHIFTS.map((s) => {
                      const a = cell(p.id, d, s);
                      const past = isPast(d, s);
                      const label = `${p.name}, ${dayName(d)} ${SHIFT_LABEL[s]}: ${a ? (a.unavailable ? "unavailable" : "on shift") : "not on shift"}`;
                      return (
                        <td key={d + s} className="px-1 py-1.5 text-center">
                          <Squircle
                            as="button"
                            type="button"
                            radius="sm"
                            focus="self"
                            aria-label={label}
                            aria-pressed={!!a}
                            title={a?.unavailable ? `Unavailable${a.unavailableReason ? `: ${a.unavailableReason}` : ""}` : undefined}
                            disabled={past || busy === `${p.id}${d}${s}`}
                            onClick={() => toggle(p.id, d, s, !a)}
                            className={cn(
                              "inline-flex size-10 items-center justify-center text-caption font-medium",
                              a?.unavailable
                                ? "sq-bg-warning-soft text-warning-fg"
                                : a
                                  ? "sq-bg-accent-soft text-info-fg"
                                  : "sq-border-border text-transparent hover:sq-bg-sunken",
                              past ? "cursor-default opacity-50" : "cursor-pointer",
                            )}
                          >
                            {a?.unavailable ? "Off" : a ? <LuCheck className="size-4" aria-hidden /> : null}
                          </Squircle>
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
              <tr className="bg-gray-50">
                <th scope="row" className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left text-caption font-medium text-fg-secondary">
                  Coverage
                </th>
                {data.gaps.map((g) => {
                  const names = g.missing.map((m) => (m === "AGENT" ? "an agent" : SERVICE_LABEL[m]));
                  return (
                    <td key={g.date + g.shift} className="px-1 py-2 text-center" title={names.length ? `Missing: ${names.join(", ")}` : "Covered"}>
                      {g.missing.length === 0 ? (
                        <LuCircleCheck className="mx-auto size-4 text-success" aria-label="Covered" />
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-caption font-medium text-warning-fg">
                          <LuCircleHelp className="size-4" aria-hidden />
                          <span className="sr-only">Missing:</span>
                          {scope === "agents" ? "" : g.missing.length}
                          <span className="sr-only">{names.join(", ")}</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-small text-fg-secondary">
        <LuCheck className="inline size-4 align-[-3px] text-info-fg" aria-hidden /> on shift · <span className="font-medium text-warning-fg">Off</span> on shift but marked
        unavailable · hover or focus a coverage mark to see what&apos;s missing.
      </p>
    </>
  );
}
