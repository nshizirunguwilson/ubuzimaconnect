import type { Metadata } from "next";
import { Suspense } from "react";
import { SetPassword } from "@/components/app/set-password";

export const metadata: Metadata = { title: "Set your password", referrer: "no-referrer" };

export default function InvitationPage({ params }: PageProps<"/staff/invitation/[token]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: { params: PageProps<"/staff/invitation/[token]">["params"] }) {
  const { token } = await params;
  return <SetPassword token={token} purpose="INVITATION" />;
}
