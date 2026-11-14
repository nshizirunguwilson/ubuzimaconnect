/** A date typed as three separate boxes. Each part is kept exactly as typed until it is sent. */
export type DateParts = { day: string; month: string; year: string };

export const EMPTY_DATE: DateParts = { day: "", month: "", year: "" };

/**
 * The parts as YYYY-MM-DD, or "" when they don't make a real date that has already happened
 * (31 February, a two-digit year, next year). An empty value shows the form's "Enter a date" message.
 */
export function partsToIsoDate(parts: DateParts, today = new Date()) {
  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  if (!/^\d{1,2}$/.test(parts.day) || !/^\d{1,2}$/.test(parts.month) || !/^\d{4}$/.test(parts.year)) return "";

  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate || year < 1900 || date > today) return "";

  return `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
}
