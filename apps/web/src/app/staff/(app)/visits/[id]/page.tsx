import type { Metadata } from "next";
import { Suspense } from "react";
import { RolePage } from "@/components/app/role-page";
import { Visit } from "./visit";

export const metadata: Metadata = { title: "Visit" };

export default function Page({ params }: PageProps<"/staff/visits/[id]">) {
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

async function Inner({ params }: { params: PageProps<"/staff/visits/[id]">["params"] }) {
  const { id } = await params;
  return <Visit id={id} />;
}
