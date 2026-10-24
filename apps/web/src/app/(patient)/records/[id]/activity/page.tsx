import type { Metadata } from "next";
import { Suspense } from "react";
import { IdleLogout } from "@/components/app/idle-logout";
import { DesktopHeader } from "@/components/patient/desktop-header";
import { Activity } from "./activity";

export const metadata: Metadata = { title: "Activity" };

export default function Page({ params }: PageProps<"/records/[id]/activity">) {
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

async function Inner({ params }: { params: PageProps<"/records/[id]/activity">["params"] }) {
  const { id } = await params;
  return <Activity id={id} />;
}
