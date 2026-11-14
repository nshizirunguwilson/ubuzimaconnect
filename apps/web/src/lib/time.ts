import { TZDate } from "@date-fns/tz";
import { addDays } from "@ubuzima/shared";
import { format } from "date-fns";

/** All times are shown in Rwanda time (Africa/Kigali), whatever the device says. */
const zone = "Africa/Kigali";

/** "12:36" */
export const formatTime = (iso: string | Date) => format(new TZDate(new Date(iso), zone), "HH:mm");
/** "24 Oct 2026" */
export const formatDate = (iso: string | Date) => format(new TZDate(new Date(iso), zone), "d MMM yyyy");
/** "24 Oct 2026, 12:36" */
export const formatDateTime = (iso: string | Date) => format(new TZDate(new Date(iso), zone), "d MMM yyyy, HH:mm");

// Calendar dates (YYYY-MM-DD) such as shift dates. They are formatted in UTC, so a date never moves to the day
// before or after because of the device's time zone.

function formatCalendarDate(isoDate: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });
}

/** "Mon 26" */
export function shortDay(isoDate: string) {
  return formatCalendarDate(isoDate, { weekday: "short", day: "numeric" });
}

/** "Monday 26 Oct" */
export function longDay(isoDate: string) {
  return formatCalendarDate(isoDate, { weekday: "long", day: "numeric", month: "short" });
}

/** The week starting on this Monday, as the schedules show it: "26 Oct - 1 Nov 2026". */
export function weekRange(monday: string) {
  const sunday = addDays(monday, 6);
  const from = formatCalendarDate(monday, { day: "numeric", month: "short" });
  const to = formatCalendarDate(sunday, { day: "numeric", month: "short", year: "numeric" });
  return `${from} - ${to}`;
}

/** A length of time as minutes and seconds: 65,000 ms is "1:05". */
export function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
