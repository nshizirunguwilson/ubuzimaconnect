import { addDays, weekStart } from "./catalog";

/** Reports cover one day, one week (Monday to Sunday) or one calendar month, in Rwanda time. */
export const PERIODS = ["day", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];

/** Midnight in Kigali (UTC+2, no daylight saving) of a YYYY-MM-DD date, as an instant. */
export function kigaliMidnight(isoDate: string) {
  return new Date(`${isoDate}T00:00:00+02:00`);
}

/** The first day of the month after this date's month, as YYYY-MM-DD. */
function firstOfNextMonth(isoDate: string) {
  const [year, month] = isoDate.split("-").map(Number);
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** The dates covered by the period containing `anchor`: from `start` up to, not including, `end`. */
export function periodRange(period: Period, anchor: string) {
  let start = anchor;
  let end = addDays(anchor, 1);

  if (period === "week") {
    start = weekStart(anchor);
    end = addDays(start, 7);
  }
  if (period === "month") {
    start = `${anchor.slice(0, 7)}-01`;
    end = firstOfNextMonth(anchor);
  }

  const days: string[] = [];
  for (let day = start; day < end; day = addDays(day, 1)) {
    days.push(day);
  }
  return { start, end, days, from: kigaliMidnight(start), to: kigaliMidnight(end) };
}

/** The anchor date of the period before (step -1) or after (step 1), for the previous and next buttons. */
export function shiftPeriod(period: Period, anchor: string, step: -1 | 1) {
  if (period === "day") return addDays(anchor, step);
  if (period === "week") return addDays(weekStart(anchor), 7 * step);

  // A month: the first day of the month before or after. Date.UTC rolls month 0 or 13 into the next year.
  const [year, month] = anchor.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1 + step, 1));
  return firstOfMonth.toISOString().slice(0, 10);
}
