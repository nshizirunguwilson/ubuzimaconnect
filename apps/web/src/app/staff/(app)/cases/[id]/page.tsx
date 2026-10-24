import type { Metadata } from "next";
import { Suspense } from "react";
import { RolePage } from "@/components/app/role-page";
import { Workspace } from "./workspace";

export const metadata: Metadata = { title: "Case" };

export default function Page({ params }: PageProps<"/staff/cases/[id]">) {
  return (
    <RolePage roles={["AGENT"]}>
      {() => (
        <Suspense>
          <Inner params={params} />
        </Suspense>
      )}
    </RolePage>
  );
}

async function Inner({ params }: { params: PageProps<"/staff/cases/[id]">["params"] }) {
  const { id } = await params;
  return <Workspace id={id} />;
}
