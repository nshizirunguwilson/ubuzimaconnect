import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { MyPrescriptions } from "./my-prescriptions";

export const metadata: Metadata = { title: "My prescriptions" };

export default function Page() {
  return <RolePage roles={["AGENT", "CLINICIAN"]}>{() => <MyPrescriptions />}</RolePage>;
}
