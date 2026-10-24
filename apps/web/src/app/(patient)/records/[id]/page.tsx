import type { Metadata } from "next";
import { Suspense } from "react";
import { IdleLogout } from "@/components/app/idle-logout";
import { DesktopHeader } from "@/components/patient/desktop-header";
import { loadRecords } from "./load";
import { RecordsView } from "./records-view";

export const metadata: Metadata = { title: "Records" };

export default function Page({ params }: PageProps<"/records/[id]">) {
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

async function Inner({ params }: { params: PageProps<"/records/[id]">["params"] }) {
  const { id } = await params;
  return <RecordsView data={await loadRecords(id)} />;
}
