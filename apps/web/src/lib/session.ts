import "server-only";
import type { Me } from "@ubuzima/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

/** The logged-in person for this request, or null. Reads the cookie, so call it inside <Suspense>. */
export async function getMe(): Promise<Me | null> {
  const session = (await cookies()).get("uc_session")?.value;
  if (!session) return null;
  const res = await fetch(`${apiUrl}/auth/me`, { headers: { cookie: `uc_session=${session}` }, cache: "no-store" }).catch(
    () => null,
  );
  if (!res?.ok) return null;
  return res.json();
}

/** "?ended=1" only when there was a session that has now ended, so the login page can say why. */
async function loginUrl(path: string) {
  return (await cookies()).has("uc_session") ? `${path}?ended=1` : path;
}

export async function requirePatient() {
  const me = await getMe();
  if (me?.kind !== "patient") redirect(await loginUrl("/login"));
  return me;
}

export async function requireStaff() {
  const me = await getMe();
  if (me?.kind !== "staff") redirect(await loginUrl("/staff/login"));
  return me;
}

/** For staff pages that belong to some roles only (FR 9). Others go back to their home. */
export async function requireRole(...roles: import("@ubuzima/shared").StaffRole[]) {
  const me = await requireStaff();
  if (!roles.includes(me.role)) redirect("/staff");
  return me;
}

/** A GET to the API from a server component, as the logged-in person. Null when it fails. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const session = (await cookies()).get("uc_session")?.value;
  if (!session) return null;
  const res = await fetch(`${apiUrl}${path}`, { headers: { cookie: `uc_session=${session}` }, cache: "no-store" }).catch(() => null);
  return res?.ok ? res.json() : null;
}
