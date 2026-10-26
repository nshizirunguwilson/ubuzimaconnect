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

/**
 * Where to send someone without the right session, so the login page can say why: "?ended=1" when their session
 * ended, "?other=1" when they are logged in, but to the other app (a patient on a staff page, or the reverse).
 */
async function loginUrl(path: string, me: Awaited<ReturnType<typeof getMe>>) {
  if (me) return `${path}?other=1`;
  return (await cookies()).has("uc_session") ? `${path}?ended=1` : path;
}

export async function requirePatient() {
  const me = await getMe();
  if (me?.kind !== "patient") redirect(await loginUrl("/login", me));
  return me;
}

export async function requireStaff() {
  const me = await getMe();
  if (me?.kind !== "staff") redirect(await loginUrl("/staff/login", me));
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
