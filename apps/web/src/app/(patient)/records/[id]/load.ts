import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Prescription } from "@/components/app/prescription";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

export type Records = {
  person: { id: string; name: string; dateOfBirth: string; age: { years: number; months: number; days: number }; sex: "FEMALE" | "MALE"; district: string | null; photoUrl: string | null };
  prescriptions: Prescription[];
  cases: {
    id: string;
    code: string;
    createdAt: string;
    status: string;
    outcome: string | null;
    closingNote: string | null;
    description: string | null;
    visits: {
      id: string;
      facility: string;
      status: string;
      arrivedAt: string;
      endedAt: string | null;
      entries: { id: string; diagnosis: string | null; treatment: string | null; notes: string | null; by: string; at: string }[];
    }[];
  }[];
};

/** FR 7.2: loads a record on the server with the session cookie. Not yours or your child's: not found. */
export async function loadRecords(id: string): Promise<Records> {
  const session = (await cookies()).get("uc_session")?.value;
  if (!session) redirect("/login");
  const res = await fetch(`${apiUrl}/records/${encodeURIComponent(id)}`, { headers: { cookie: `uc_session=${session}` }, cache: "no-store" });
  if (res.status === 401) redirect("/login?ended=1");
  if (!res.ok) notFound();
  return res.json();
}
