import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Patients } from "./patients";

export const metadata: Metadata = { title: "Patients" };

export default function Page() {
  return <RolePage roles={["CLINICIAN"]}>{(me) => <Patients facility={me.facility?.name ?? null} />}</RolePage>;
}
