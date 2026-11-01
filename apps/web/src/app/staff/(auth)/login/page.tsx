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
  const query = await searchParams;
  return (
    <StaffLoginForm
      ended={query.ended === "1"}
      other={query.other === "1"}
      done={query.done === "password" ? "password" : query.done === "unlocked" ? "unlocked" : null}
    />
  );
}
