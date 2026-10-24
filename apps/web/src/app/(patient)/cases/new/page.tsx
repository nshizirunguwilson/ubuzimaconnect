import type { Metadata } from "next";
import { Suspense } from "react";
import { DesktopHeader } from "@/components/patient/desktop-header";
import { requirePatient } from "@/lib/session";
import { StartCase } from "./start-case";
import { getT } from "@/i18n/server";

export const metadata: Metadata = { title: "Get help" };

export default function Page({ searchParams }: PageProps<"/cases/new">) {
  return (
    <>
      <DesktopHeader />
      <Suspense>
        <Inner searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Inner({ searchParams }: { searchParams: PageProps<"/cases/new">["searchParams"] }) {
  const me = await requirePatient();
  const t = await getT();
  const { for: forId } = await searchParams;
  const people = [
    { id: me.id, name: me.name, label: t.common.me, self: true },
    ...me.family.map((f) => ({ id: f.id, name: f.name, label: t.start.childLabel(f.name.split(" ")[0], f.age), self: false })),
  ];
  return <StartCase people={people} preselected={typeof forId === "string" ? forId : null} sharedDevice={me.sharedDevice} />;
}
