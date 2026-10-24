import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { StaffActivity } from "./staff-activity";

export const metadata: Metadata = { title: "Activity" };

export default function Page() {
  return <RolePage roles={["ADMIN", "FACILITY_MANAGER"]}>{(me) => <StaffActivity admin={me.role === "ADMIN"} facility={me.facility?.name ?? null} />}</RolePage>;
}
