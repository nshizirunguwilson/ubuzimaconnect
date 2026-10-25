import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { MockNida } from "./mock-nida";

export const metadata: Metadata = { title: "Mock NIDA" };

export default function MockNidaPage() {
  return (
    <Suspense>
      <AdminOnly />
    </Suspense>
  );
}

async function AdminOnly() {
  const me = await requireStaff();
  if (me.role !== "ADMIN") redirect("/staff");
  return <MockNida />;
}
