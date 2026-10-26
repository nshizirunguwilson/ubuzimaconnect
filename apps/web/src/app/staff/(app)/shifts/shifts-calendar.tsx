"use client";

import type { EventContentArg } from "@fullcalendar/core";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { addDays, SHIFT_HOURS, SHIFT_LABEL, type ShiftType } from "@ubuzima/shared";
import type { Shift } from "./my-shifts";

const start = (date: string, shift: ShiftType) => `${date}T${shift === "DAY" ? "07" : "19"}:00:00`;
const end = (date: string, shift: ShiftType) => (shift === "DAY" ? `${date}T19:00:00` : `${addDays(date, 1)}T07:00:00`);

/**
 * D77: the person's own week as a calendar. Each day runs 07:00 to 07:00, so a night shift is one block in the day it
 * starts. Clicking a coming shift opens the same "Mark unavailable" dialog as the list.
 */
export function ShiftsCalendar({
  monday,
  shifts,
  isPast,
  onPick,
}: {
  monday: string;
  shifts: Shift[];
  isPast: (s: Shift) => boolean;
  onPick?: (s: Shift) => void;
}) {
  const content = (arg: EventContentArg) => {
    const s = arg.event.extendedProps.shift as Shift;
    return (
      <span className="flex h-full flex-col gap-0.5 p-1.5 text-caption">
        <span className="font-semibold">{s.unavailable ? "Unavailable" : `${SHIFT_LABEL[s.shift]} shift`}</span>
        <span>{SHIFT_HOURS[s.shift]}</span>
        {s.unavailable && s.unavailableReason && <span className="line-clamp-2">{s.unavailableReason}</span>}
      </span>
    );
  };

  return (
    <div className="uc-calendar max-w-[960px]">
      <FullCalendar
        key={monday}
        plugins={[timeGridPlugin]}
        initialView="timeGridWeek"
        initialDate={monday}
        timeZone="UTC"
        firstDay={1}
        headerToolbar={false}
        allDaySlot={false}
        height="auto"
        slotMinTime="07:00"
        slotMaxTime="31:00"
        slotDuration="02:00"
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        dayHeaderFormat={{ weekday: "short", day: "numeric" }}
        nowIndicator
        now={() => new Date(Date.now() + 2 * 3_600_000)} // Kigali wall time, as the shifts are
        events={shifts.map((s) => ({
          id: s.id,
          start: start(s.date, s.shift),
          end: end(s.date, s.shift),
          classNames: [s.unavailable ? "uc-ev-off" : "uc-ev-on", isPast(s) ? "uc-ev-past" : onPick ? "cursor-pointer" : ""],
          extendedProps: { shift: s },
        }))}
        eventContent={content}
        eventClick={(info) => {
          const s = info.event.extendedProps.shift as Shift;
          if (onPick && !isPast(s)) onPick(s);
        }}
      />
    </div>
  );
}
