import type { Metadata } from "next";
import { Suspense } from "react";
import { RolePage } from "@/components/app/role-page";
import { Arrival } from "./arrival";

export const metadata: Metadata = { title: "Incoming patient" };

export default function Page({ params }: PageProps<"/staff/incoming/[id]">) {
  return (
    <RolePage roles={["CLINICIAN"]}>
      {() => (
        <Suspense>
          <Inner params={params} />
        </Suspense>
      )}
    </RolePage>
  );
}

async function Inner({ params }: { params: PageProps<"/staff/incoming/[id]">["params"] }) {
  const { id } = await params;
  return <Arrival id={id} />;
}
