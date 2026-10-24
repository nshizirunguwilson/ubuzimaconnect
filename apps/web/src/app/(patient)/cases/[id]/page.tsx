import type { Metadata } from "next";
import { cookies } from "next/headers";
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
  const session = (await cookies()).get("uc_session")?.value;
  if (!session) redirect("/login");
  const res = await fetch(`${apiUrl}/cases/${encodeURIComponent(id)}`, { headers: { cookie: `uc_session=${session}` }, cache: "no-store" });
  if (res.status === 401) redirect("/login?ended=1");
  if (!res.ok) notFound();
  const view: CaseView = await res.json();
  return <CaseFlow key={view.id} initial={view} />;
}
