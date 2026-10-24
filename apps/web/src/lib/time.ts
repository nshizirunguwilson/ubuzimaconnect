import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** All times are shown in Rwanda time (Africa/Kigali), whatever the device says. */
const zone = "Africa/Kigali";

/** "12:36" */
export const formatTime = (iso: string | Date) => format(new TZDate(new Date(iso), zone), "HH:mm");
/** "24 Oct 2026" (DESIGN.md §10) */
export const formatDate = (iso: string | Date) => format(new TZDate(new Date(iso), zone), "d MMM yyyy");
/** "24 Oct 2026, 12:36" */
export const formatDateTime = (iso: string | Date) => format(new TZDate(new Date(iso), zone), "d MMM yyyy, HH:mm");
