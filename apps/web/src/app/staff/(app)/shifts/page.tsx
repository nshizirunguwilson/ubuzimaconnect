import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { MyShifts } from "./my-shifts";

export const metadata: Metadata = { title: "My shifts" };

export default function Page() {
  return <RolePage roles={["CLINICIAN", "AGENT"]}>{(me) => <MyShifts canMarkUnavailable={me.role === "CLINICIAN"} />}</RolePage>;
}
