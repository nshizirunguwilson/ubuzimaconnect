import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { OnDuty } from "./on-duty";

export const metadata: Metadata = { title: "On duty" };

export default function Page() {
  return <RolePage roles={["ADMIN"]}>{() => <OnDuty />}</RolePage>;
}
