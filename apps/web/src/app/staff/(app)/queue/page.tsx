import { greetingName } from "@ubuzima/shared";
import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Queue } from "./queue";

export const metadata: Metadata = { title: "Queue" };

export default function Page() {
  return <RolePage roles={["AGENT"]}>{(me) => <Queue firstName={greetingName(me.name)} />}</RolePage>;
}
