import "server-only";
import type { Me } from "@ubuzima/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

/** D76: one session cookie per app, so a patient and a staff member can be logged in side by side. */
export const COOKIE = { patient: "uc_patient", staff: "uc_staff" } as const;
type App = keyof typeof COOKIE;

/** This app's session cookie, as a Cookie header for a call to the API; null when there is none. */
export async function sessionCookie(app: App) {
  const value = (await cookies()).get(COOKIE[app])?.value;
  return value ? `${COOKIE[app]}=${value}` : null;
}

/** The logged-in person of this app for this request, or null. Reads the cookie, so call it inside <Suspense>. */
export async function getMe(app: App): Promise<Me | null> {
  const cookie = await sessionCookie(app);
  if (!cookie) return null;
  const res = await fetch(`${apiUrl}/auth/me`, { headers: { cookie, "x-uc-app": app }, cache: "no-store" }).catch(
    () => null,
  );
  if (!res?.ok) return null;
  return res.json();
}

/**
 * Where to send someone without the right session, so the login page can say why: "?ended=1" only when their
 * session ended after 15 idle minutes, "?other=1" when they are logged in, but to the other app (a patient on a staff
 * page, or the reverse). A staff login still waiting for its code goes back to the code screen; one whose code ran
 * out, or a session ended by logging out, goes to the plain login page.
 */
async function loginUrl(app: App, path: string) {
  if (await getMe(app === "staff" ? "patient" : "staff")) return `${path}?other=1`;
  const cookie = await sessionCookie(app);
  if (!cookie) return path;
  const res = await fetch(`${apiUrl}/auth/session`, { headers: { cookie, "x-uc-app": app }, cache: "no-store" }).catch(() => null);
  const { state } = res?.ok ? ((await res.json()) as { state: string }) : { state: "none" };
  if (state === "unfinished" && app === "staff") return "/staff/login/code";
  return state === "ended" ? `${path}?ended=1` : path;
}

export async function requirePatient() {
  const me = await getMe("patient");
  if (me?.kind !== "patient") redirect(await loginUrl("patient", "/login"));
  return me;
}

export async function requireStaff() {
  const me = await getMe("staff");
  if (me?.kind !== "staff") redirect(await loginUrl("staff", "/staff/login"));
  return me;
}

/** For staff pages that belong to some roles only (FR 9). Others go back to their home. */
export async function requireRole(...roles: import("@ubuzima/shared").StaffRole[]) {
  const me = await requireStaff();
  if (!roles.includes(me.role)) redirect("/staff");
  return me;
}

/** A GET to the API from a server component, as the logged-in person. Null when it fails. */
export async function apiGet<T>(path: string, app: App = "patient"): Promise<T | null> {
  const cookie = await sessionCookie(app);
  if (!cookie) return null;
  const res = await fetch(`${apiUrl}${path}`, { headers: { cookie, "x-uc-app": app }, cache: "no-store" }).catch(() => null);
  return res?.ok ? res.json() : null;
}
