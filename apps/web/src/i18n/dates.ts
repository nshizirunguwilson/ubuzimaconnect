import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { Lang } from "./index";

/** Kinyarwanda month names; date-fns has no Kinyarwanda locale. */
const RW_MONTHS = [
  "Mutarama",
  "Gashyantare",
  "Werurwe",
  "Mata",
  "Gicurasi",
  "Kamena",
  "Nyakanga",
  "Kanama",
  "Nzeri",
  "Ukwakira",
  "Ugushyingo",
  "Ukuboza",
];
const kigali = (iso: string | Date) => new TZDate(new Date(iso), "Africa/Kigali");

/** "24 Oct 2026" / "24 Ukwakira 2026", always in Rwanda time. */
export function formatDateIn(lang: Lang, iso: string | Date) {
  const date = kigali(iso);
  return lang === "rw"
    ? `${date.getDate()} ${RW_MONTHS[date.getMonth()]} ${date.getFullYear()}`
    : format(date, "d MMM yyyy");
}
export const formatTimeIn = (_lang: Lang, iso: string | Date) => format(kigali(iso), "HH:mm");
export const formatDateTimeIn = (lang: Lang, iso: string | Date) =>
  `${formatDateIn(lang, iso)}, ${formatTimeIn(lang, iso)}`;
