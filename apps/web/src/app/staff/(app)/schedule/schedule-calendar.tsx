"use client";

import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg } from "@fullcalendar/core";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import { addDays, SERVICE_LABEL, SHIFT_HOURS, SHIFT_LABEL, type ShiftType } from "@ubuzima/shared";
import { useState } from "react";
import { LuCheck, LuCircleCheck, LuCircleHelp } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Week } from "./schedule";
import { shortDay } from "@/lib/time";

const COVERAGE = "coverage";
const start = (date: string, shift: ShiftType) => `${date}T${shift === "DAY" ? "07" : "19"}:00:00`;
const end = (date: string, shift: ShiftType) => (shift === "DAY" ? `${date}T19:00:00` : `${addDays(date, 1)}T07:00:00`);
/** A slot's date and shift from its start, read as a wall time (the calendar runs in UTC, so nothing shifts). */
const slotOf = (d: Date) => ({
  date: d.toISOString().slice(0, 10),
  shift: (d.getUTCHours() === 7 ? "DAY" : "NIGHT") as ShiftType,
});

/**
 * The week as a timeline, like a shared calendar. One row per person, a column per Day and Night shift.
 * Click an empty shift to add the person, drag a shift to move it, click a shift to remove it.
 * Past shifts are locked. The bottom row shows what each shift is missing.
 */
export function ScheduleCalendar({
  data,
  scope,
  isPast,
  setShift,
}: {
  data: Week;
  scope: "agents" | "clinicians";
  isPast: (date: string, shift: ShiftType) => boolean;
  setShift: (staffId: string, date: string, shift: ShiftType, assigned: boolean) => Promise<boolean>;
}) {
  const [removing, setRemoving] = useState<{ staffId: string; name: string; date: string; shift: ShiftType } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const name = (id: string) => data.people.find((person) => person.id === id)?.name ?? "";

  const resources = [
    ...data.people.map((person, index) => ({
      id: person.id,
      title: person.name,
      extendedProps: { sub: person.specialty ? SERVICE_LABEL[person.specialty] : null, order: index },
    })),
    { id: COVERAGE, title: "Coverage", extendedProps: { sub: null, order: data.people.length } },
  ];
  const events = [
    ...data.assignments.map((assignment) => ({
      id: assignment.id,
      resourceId: assignment.staffId,
      start: start(assignment.date, assignment.shift),
      end: end(assignment.date, assignment.shift),
      title: assignment.unavailable ? "Off" : "",
      editable: !isPast(assignment.date, assignment.shift),
      classNames: [
        assignment.unavailable ? "uc-ev-off" : "uc-ev-on",
        isPast(assignment.date, assignment.shift) ? "uc-ev-past" : "",
      ],
      extendedProps: {
        staffId: assignment.staffId,
        date: assignment.date,
        shift: assignment.shift,
        reason: assignment.unavailableReason,
      },
    })),
    ...data.gaps.map((shiftGap) => {
      const names = shiftGap.missing.map((missing) => (missing === "AGENT" ? "an agent" : SERVICE_LABEL[missing]));
      return {
        id: `gap-${shiftGap.date}-${shiftGap.shift}`,
        resourceId: COVERAGE,
        start: start(shiftGap.date, shiftGap.shift),
        end: end(shiftGap.date, shiftGap.shift),
        title: names.length ? (scope === "agents" ? "" : String(names.length)) : "",
        editable: false,
        classNames: [
          names.length ? "uc-ev-gap" : "uc-ev-covered",
          isPast(shiftGap.date, shiftGap.shift) ? "uc-ev-past" : "",
        ],
        extendedProps: { coverage: true, missing: names },
      };
    }),
  ];

  const open = (resourceId: string | undefined, d: Date) => {
    const { date, shift } = slotOf(d);
    return !!resourceId && resourceId !== COVERAGE && !isPast(date, shift);
  };

  async function select(info: DateSelectArg) {
    info.view.calendar.unselect();
    const resourceId = info.resource?.id;
    if (!open(resourceId, info.start)) return;
    const { date, shift } = slotOf(info.start);
    await setShift(resourceId!, date, shift, true);
  }

  async function drop(info: EventDropArg) {
    const { staffId, date, shift } = info.event.extendedProps as { staffId: string; date: string; shift: ShiftType };
    const to = { staffId: info.newResource?.id ?? staffId, ...slotOf(info.event.start!) };
    // Add the new shift first, so a failed move never leaves the person with neither.
    if (!(await setShift(to.staffId, to.date, to.shift, true))) return info.revert();
    if (!(await setShift(staffId, date, shift, false)))
      await setShift(to.staffId, to.date, to.shift, false).then(() => info.revert());
  }

  function click(info: EventClickArg) {
    const details = info.event.extendedProps as { coverage?: boolean; staffId: string; date: string; shift: ShiftType };
    if (details.coverage || isPast(details.date, details.shift)) return;
    setRemoving({ staffId: details.staffId, name: name(details.staffId), date: details.date, shift: details.shift });
  }

  function content(arg: EventContentArg) {
    const details = arg.event.extendedProps as { coverage?: boolean; missing?: string[]; reason?: string | null };
    const tip = details.coverage
      ? details.missing?.length
        ? `Missing: ${details.missing.join(", ")}`
        : "Covered"
      : details.reason
        ? `Unavailable: ${details.reason}`
        : undefined;
    if (details.coverage) {
      return (
        <span className="flex items-center justify-center gap-0.5 py-1 text-caption font-medium" title={tip}>
          {details.missing?.length ? (
            <LuCircleHelp className="size-4" aria-hidden />
          ) : (
            <LuCircleCheck className="size-4" aria-hidden />
          )}
          {arg.event.title}
          <span className="sr-only">{tip}</span>
        </span>
      );
    }
    return (
      <span className="flex items-center justify-center py-1 text-caption font-medium" title={tip}>
        {arg.event.title || <LuCheck className="size-4" aria-hidden />}
        <span className="sr-only">{arg.event.title ? "" : "On shift"}</span>
        {tip && <span className="sr-only">. {tip}</span>}
      </span>
    );
  }

  return (
    <>
      <div className="uc-calendar">
        <FullCalendar
          key={data.monday}
          plugins={[resourceTimelinePlugin, interactionPlugin]}
          schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
          initialView="resourceTimelineWeek"
          initialDate={data.monday}
          timeZone="UTC"
          firstDay={1}
          headerToolbar={false}
          height="auto"
          slotMinTime="07:00"
          slotMaxTime="31:00"
          slotDuration={{ hours: 12 }}
          slotMinWidth={50}
          slotLabelFormat={[
            { weekday: "short", day: "numeric" },
            { hour: "2-digit", hour12: false },
          ]}
          slotLabelContent={(arg) =>
            arg.level === 0
              ? arg.date.toISOString().slice(0, 10) === data.now.date
                ? `Today, ${shortDay(data.now.date)}`
                : arg.text
              : SHIFT_LABEL[slotOf(arg.date).shift]
          }
          nowIndicator
          now={() => new Date(Date.now() + 2 * 3_600_000)} // Kigali wall time, as the shifts are
          resourceAreaHeaderContent={scope === "agents" ? "Agent" : "Clinician"}
          resourceAreaWidth="clamp(140px, 22%, 220px)"
          resourceOrder="order"
          resources={resources}
          resourceLabelContent={(arg) => (
            <span className="flex min-w-0 flex-col">
              <span
                className={
                  arg.resource.id === COVERAGE
                    ? "text-caption font-medium text-fg-secondary"
                    : "truncate text-small font-semibold text-fg"
                }
              >
                {arg.resource.title}
              </span>
              {arg.resource.extendedProps.sub && (
                <span className="truncate text-caption text-fg-secondary">{arg.resource.extendedProps.sub}</span>
              )}
            </span>
          )}
          events={events}
          eventContent={content}
          eventDurationEditable={false}
          eventOverlap={false}
          eventAllow={(span, ev) => open(span.resource?.id, span.start) && !ev?.extendedProps.coverage}
          selectable
          selectOverlap={false}
          selectAllow={(span) =>
            open(span.resource?.id, span.start) && span.end.getTime() - span.start.getTime() === 12 * 3_600_000
          }
          select={select}
          eventDrop={drop}
          eventClick={click}
        />
      </div>
      <p className="text-small text-fg-secondary">
        Click an empty shift to add someone, drag a shift to move it, click a shift to remove it.{" "}
        <span className="font-medium text-warning-fg">Off</span>: on shift but marked unavailable. Day {SHIFT_HOURS.DAY}
        , Night {SHIFT_HOURS.NIGHT}.
      </p>

      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        {removing && (
          <DialogContent
            title={`Remove ${removing.name} from this shift?`}
            description={`${shortDay(removing.date)}, ${SHIFT_LABEL[removing.shift].toLowerCase()} shift (${SHIFT_HOURS[removing.shift]}).`}
            actions={
              <>
                <Button variant="secondary" onClick={() => setRemoving(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={async () => {
                    setPending(true);
                    const ok = await setShift(removing.staffId, removing.date, removing.shift, false);
                    setPending(false);
                    if (ok) setRemoving(null);
                  }}
                >
                  Remove from shift
                </Button>
              </>
            }
          />
        )}
      </Dialog>
    </>
  );
}
