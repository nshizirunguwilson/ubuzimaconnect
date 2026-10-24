import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { FacilityProfilePage } from "./profile";

export const metadata: Metadata = { title: "Facility profile" };

export default function Page() {
  return <RolePage roles={["FACILITY_MANAGER"]}>{() => <FacilityProfilePage />}</RolePage>;
}
