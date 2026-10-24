import { addDays, weekStart } from "./catalog";

/** FR 12.8: reports filter by one day, one week (Monday to Sunday) or one calendar month, in Rwanda time. */
export const PERIODS = ["day", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];

/** Midnight in Kigali (UTC+2, no daylight saving) of a YYYY-MM-DD date, as an instant. */
export const kigaliMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00+02:00`);

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
    const [y, m] = anchor.split("-").map(Number);
    end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  const days: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  return { start, end, days, from: kigaliMidnight(start), to: kigaliMidnight(end) };
}

/** The anchor date of the period before or after, for the ‹ › buttons. */
export function shiftPeriod(period: Period, anchor: string, step: -1 | 1) {
  if (period === "day") return addDays(anchor, step);
  if (period === "week") return addDays(weekStart(anchor), 7 * step);
  const [y, m] = anchor.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1 + step, 1));
  return n.toISOString().slice(0, 10);
}
