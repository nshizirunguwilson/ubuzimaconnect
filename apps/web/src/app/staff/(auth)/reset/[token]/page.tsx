import type { Metadata } from "next";
import { Suspense } from "react";
import { SetPassword } from "@/components/app/set-password";

export const metadata: Metadata = { title: "New password", referrer: "no-referrer" };

export default function ResetPage({ params }: PageProps<"/staff/reset/[token]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/staff/reset/[token]">["params"] }) {
  const { token } = await params;
  return <SetPassword token={token} purpose="PASSWORD_RESET" />;
}
