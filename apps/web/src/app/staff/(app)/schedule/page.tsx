import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Schedule } from "./schedule";

export const metadata: Metadata = { title: "Schedule" };

export default function Page() {
  return <RolePage roles={["ADMIN", "FACILITY_MANAGER"]}>{(me) => <Schedule scope={me.role === "ADMIN" ? "agents" : "clinicians"} />}</RolePage>;
}
