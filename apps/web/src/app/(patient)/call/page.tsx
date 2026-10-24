import type { Metadata } from "next";
import { Suspense } from "react";
import { DesktopHeader } from "@/components/patient/desktop-header";
import { requirePatient } from "@/lib/session";
import { PreferCall } from "./prefer-call";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Prefer a call" };

export default function Page({ searchParams }: PageProps<"/call">) {
  return (
    <>
      <DesktopHeader />
      <Suspense>
        <Inner searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Inner({ searchParams }: { searchParams: PageProps<"/call">["searchParams"] }) {
  const me = await requirePatient();
  const t = await getT();
  const { case: caseId } = await searchParams;
  const people = [{ id: me.id, label: t.common.me }, ...me.family.map((f) => ({ id: f.id, label: f.name.split(" ")[0] }))];
  return <PreferCall caseId={typeof caseId === "string" ? caseId : null} people={people} />;
}
