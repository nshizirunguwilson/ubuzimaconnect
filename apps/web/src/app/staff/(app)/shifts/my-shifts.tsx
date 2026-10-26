"use client";

import {
  addDays,
  SHIFT_HOURS,
  SHIFT_LABEL,
  type ShiftType,
} from "@ubuzima/shared";
import dynamic from "next/dynamic";
import { useState, type FormEvent } from "react";
import { LuCalendarClock, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status";
import { Tab, Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { useApi } from "@/lib/use-api";

export type Shift = {
  id: string;
  date: string;
  shift: ShiftType;
  unavailable: boolean;
  unavailableReason: string | null;
};
type Data = {
  monday: string;
  days: string[];
  now: { date: string; shift: ShiftType };
  shifts: Shift[];
};

// FullCalendar reads the window, so it loads in the browser only (D77).
const ShiftsCalendar = dynamic(
  () => import("./shifts-calendar").then((m) => m.ShiftsCalendar),
  {
    ssr: false,
    loading: () => <div className="h-96" aria-busy />,
  },
);

const range = (monday: string) => {
  const f = (iso: string, o: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
      ...o,
      timeZone: "UTC",
    });
  return `${f(monday, { day: "numeric", month: "short" })} – ${f(addDays(monday, 6), { day: "numeric", month: "short", year: "numeric" })}`;
};
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** FR 8.5: a clinician sees their shifts and marks themselves unavailable; routing uses it at once. Agents see theirs (FR 12.4). */
export function MyShifts({
  canMarkUnavailable,
}: {
  canMarkUnavailable: boolean;
}) {
  const [week, setWeek] = useState<string | null>(null);
  const { data, reload } = useApi<Data>(
    `/me/shifts${week ? `?week=${week}` : ""}`,
  );
  const [picked, setPicked] = useState<Shift | null>(null);
  if (!data) return <div className="h-96" aria-busy />;

  const state = (s: Shift) => {
    const past =
      s.date < data.now.date ||
      (s.date === data.now.date &&
        s.shift === "DAY" &&
        data.now.shift === "NIGHT");
    const now = s.date === data.now.date && s.shift === data.now.shift;
    return { past, now };
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My shifts"
        intro={
          canMarkUnavailable
            ? "If you can't work a shift, mark it here. Patients are no longer routed to you for that shift."
            : "Your shifts this week, set by the administrator."
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-heading text-h3 font-semibold text-fg">
          {range(data.monday)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeek(addDays(data.monday, -7))}
          >
            <LuChevronLeft />
          </Button>
          <Button
            variant="secondary"
            size="compact"
            onClick={() => setWeek(null)}
          >
            This week
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeek(addDays(data.monday, 7))}
          >
            <LuChevronRight />
          </Button>
        </div>
      </div>
      <Tabs defaultValue="calendar" className="flex flex-col gap-4">
        <TabsList aria-label="Shifts view">
          <Tab value="calendar">Calendar</Tab>
          <Tab value="list" count={data.shifts.length}>
            List
          </Tab>
        </TabsList>
        <TabsContent value="calendar" className="flex flex-col gap-3">
          <ShiftsCalendar
            monday={data.monday}
            shifts={data.shifts}
            isPast={(s) => state(s).past}
            onPick={canMarkUnavailable ? setPicked : undefined}
          />
          {canMarkUnavailable && (
            <p className="text-small text-fg-secondary">
              Click a coming shift to mark yourself unavailable, or available
              again.
            </p>
          )}
        </TabsContent>
        <TabsContent value="list">
          <Card className="max-w-[720px] p-0 md:p-0">
            {data.shifts.length === 0 ? (
              <EmptyState
                icon={LuCalendarClock}
                message="No shifts this week."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.shifts.map((s) => {
                  const { past, now } = state(s);
                  return (
                    <li
                      key={s.id}
                      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6 ${past ? "opacity-60" : ""}`}
                    >
                      <div className="flex min-w-0 flex-1 basis-48 flex-col">
                        <span className="font-semibold text-fg">
                          {longDay(s.date)}
                        </span>
                        <span className="text-small text-fg-secondary">
                          {SHIFT_LABEL[s.shift]} · {SHIFT_HOURS[s.shift]}
                          {s.unavailable && s.unavailableReason
                            ? ` · ${s.unavailableReason}`
                            : ""}
                        </span>
                      </div>
                      {now && !s.unavailable && (
                        <StatusBadge tone="info">On shift now</StatusBadge>
                      )}
                      {s.unavailable && (
                        <StatusBadge tone="warning">Unavailable</StatusBadge>
                      )}
                      {canMarkUnavailable && !past && (
                        <Button
                          variant={s.unavailable ? "ghost" : "secondary"}
                          size="compact"
                          onClick={() => setPicked(s)}
                        >
                          {s.unavailable ? "I can work it" : "Mark unavailable"}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      {picked && (
        <Availability
          key={picked.id}
          shift={picked}
          onClose={() => setPicked(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

function Availability({
  shift,
  onClose,
  onDone,
}: {
  shift: Shift;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function send(unavailable: boolean) {
    setPending(true);
    try {
      await api(`/me/shifts/${shift.id}/unavailable`, {
        unavailable,
        reason: reason || undefined,
      });
      toast.success(
        unavailable ? "Marked unavailable" : "You're available again",
      );
      onClose();
      await onDone();
    } catch (e) {
      toast.error(
        e instanceof ApiFailure ? e.error.message : "Couldn't save. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const when = `the ${SHIFT_LABEL[shift.shift].toLowerCase()} shift on ${longDay(shift.date)}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {shift.unavailable ? (
        <DialogContent
          title={`Can you work ${when}?`}
          description="Patients can be routed to you again for this shift."
          actions={
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={pending}
                onClick={() => send(false)}
              >
                I can work it
              </Button>
            </>
          }
        />
      ) : (
        <DialogContent
          title={`Unavailable for ${when}?`}
          description="No new patients are routed to you for this shift. Your manager sees it on the schedule."
          actions={
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                form={`unavail-${shift.id}`}
                loading={pending}
              >
                Mark unavailable
              </Button>
            </>
          }
        >
          <form
            id={`unavail-${shift.id}`}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void send(true);
            }}
          >
            <Input
              label="Reason"
              optional
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              hint="Your manager sees this"
              autoComplete="off"
            />
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
