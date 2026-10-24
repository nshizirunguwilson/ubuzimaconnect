import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckResult } from "./check-result";

export const metadata: Metadata = { title: "Prescription check" };

export default function Page({ params }: PageProps<"/check/[code]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/check/[code]">["params"] }) {
  const { code } = await params;
  return <CheckResult code={decodeURIComponent(code)} />;
}
