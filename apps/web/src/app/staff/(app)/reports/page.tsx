import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Reports } from "./reports";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <RolePage roles={["ADMIN", "FACILITY_MANAGER", "AGENT", "CLINICIAN"]}>{() => <Reports />}</RolePage>;
}
