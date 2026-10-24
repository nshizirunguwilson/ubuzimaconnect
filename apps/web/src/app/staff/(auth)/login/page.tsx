import type { Metadata } from "next";
import { Suspense } from "react";
import { StaffLoginForm } from "./form";

export const metadata: Metadata = { title: "Staff login" };

export default function StaffLoginPage({ searchParams }: PageProps<"/staff/login">) {
  return (
    <Suspense>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}

async function Inner({ searchParams }: { searchParams: PageProps<"/staff/login">["searchParams"] }) {
  const q = await searchParams;
  return <StaffLoginForm ended={q.ended === "1"} done={q.done === "password" ? "password" : q.done === "unlocked" ? "unlocked" : null} />;
}
