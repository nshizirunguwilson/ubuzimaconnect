import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Clinicians } from "./clinicians";

export const metadata: Metadata = { title: "Clinicians" };

export default function Page() {
  return <RolePage roles={["FACILITY_MANAGER"]}>{(me) => <Clinicians facility={me.facility?.name ?? "your facility"} />}</RolePage>;
}
