import type { Metadata } from "next";
import { sessionCookie } from "@/lib/session";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { DesktopHeader } from "@/components/patient/desktop-header";
import { IdleLogout } from "@/components/app/idle-logout";
import { CaseFlow, type CaseView } from "./case-flow";

export const metadata: Metadata = { title: "Your request" };

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

export default function Page({ params }: PageProps<"/cases/[id]">) {
  return (
    <>
      <DesktopHeader />
      <Suspense>
        <Inner params={params} />
      </Suspense>
      <IdleLogout to="/login" />
    </>
  );
}

async function Inner({ params }: { params: PageProps<"/cases/[id]">["params"] }) {
  const { id } = await params;
  const cookie = await sessionCookie("patient");
  if (!cookie) redirect("/login");
  const res = await fetch(`${apiUrl}/cases/${encodeURIComponent(id)}`, { headers: { cookie, "x-uc-app": "patient" }, cache: "no-store" });
  if (res.status === 401) redirect("/login?ended=1");
  if (!res.ok) notFound();
  const view: CaseView = await res.json();
  return <CaseFlow key={view.id} initial={view} />;
}
