"use client";

import { addDays, SHIFT_HOURS, SHIFT_LABEL, type ShiftType } from "@ubuzima/shared";
import { useState, type FormEvent } from "react";
import { LuCalendarClock, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Data = {
  monday: string;
  days: string[];
  now: { date: string; shift: ShiftType };
  shifts: { id: string; date: string; shift: ShiftType; unavailable: boolean; unavailableReason: string | null }[];
};

const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

/** FR 8.5: a clinician sees their shifts and marks themselves unavailable; routing uses it at once. Agents see theirs (FR 12.4). */
export function MyShifts({ canMarkUnavailable }: { canMarkUnavailable: boolean }) {
  const [week, setWeek] = useState<string | null>(null);
  const { data, reload } = useApi<Data>(`/me/shifts${week ? `?week=${week}` : ""}`);
  if (!data) return <div className="h-96" aria-busy />;

  const state = (s: Data["shifts"][number]) => {
    const past = s.date < data.now.date || (s.date === data.now.date && s.shift === "DAY" && data.now.shift === "NIGHT");
    const now = s.date === data.now.date && s.shift === data.now.shift;
    return { past, now };
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My shifts"
        intro={canMarkUnavailable ? "If you can't work a shift, mark it here. Patients are no longer routed to you for that shift." : "Your shifts this week, set by the administrator."}
      />
      <div className="flex items-center justify-end gap-2">
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
      <Card className="max-w-[720px] p-0 md:p-0">
        {data.shifts.length === 0 ? (
          <EmptyState icon={LuCalendarClock} message="No shifts this week." />
        ) : (
          <ul className="divide-y divide-border">
            {data.shifts.map((s) => {
              const { past, now } = state(s);
              return (
                <li key={s.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6 ${past ? "opacity-60" : ""}`}>
                  <div className="flex min-w-0 flex-1 basis-48 flex-col">
                    <span className="font-semibold text-fg">{longDay(s.date)}</span>
                    <span className="text-small text-fg-secondary">
                      {SHIFT_LABEL[s.shift]} · {SHIFT_HOURS[s.shift]}
                      {s.unavailable && s.unavailableReason ? ` · ${s.unavailableReason}` : ""}
                    </span>
                  </div>
                  {now && !s.unavailable && <StatusBadge tone="info">On shift now</StatusBadge>}
                  {s.unavailable && <StatusBadge tone="warning">Unavailable</StatusBadge>}
                  {canMarkUnavailable && !past && <Availability shift={s} onDone={reload} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Availability({ shift, onDone }: { shift: Data["shifts"][number]; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function send(unavailable: boolean) {
    setPending(true);
    try {
      await api(`/me/shifts/${shift.id}/unavailable`, { unavailable, reason: reason || undefined });
      toast.success(unavailable ? "Marked unavailable" : "You're available again");
      setOpen(false);
      await onDone();
    } catch (e) {
      toast.error(e instanceof ApiFailure ? e.error.message : "Couldn't save. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (shift.unavailable) {
    return (
      <Button variant="ghost" size="compact" loading={pending} onClick={() => send(false)}>
        I can work it
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="compact">
          Mark unavailable
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Unavailable for the ${SHIFT_LABEL[shift.shift].toLowerCase()} shift on ${longDay(shift.date)}?`}
        description="No new patients are routed to you for this shift. Your manager sees it on the schedule."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={`unavail-${shift.id}`} loading={pending}>
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
          <Input label="Reason" optional value={reason} onChange={(e) => setReason(e.target.value)} hint="Your manager sees this" autoComplete="off" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
