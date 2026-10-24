import type { Metadata } from "next";
import { Suspense } from "react";
import { loadRecords } from "../load";
import { PrintSummary } from "./print-summary";

export const metadata: Metadata = { title: "Health summary" };

export default function Page({ params }: PageProps<"/records/[id]/print">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/records/[id]/print">["params"] }) {
  const { id } = await params;
  return <PrintSummary data={await loadRecords(id)} />;
}
