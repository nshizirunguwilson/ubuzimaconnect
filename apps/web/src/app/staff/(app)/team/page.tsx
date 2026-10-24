import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { Team } from "./team";

export const metadata: Metadata = { title: "Staff accounts" };

export default function TeamPage() {
  return (
    <Suspense>
      <AdminOnly />
    </Suspense>
  );
}

async function AdminOnly() {
  const me = await requireStaff();
  if (me.role !== "ADMIN") redirect("/staff");
  return <Team meId={me.id} />;
}
