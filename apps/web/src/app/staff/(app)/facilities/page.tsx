import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Facilities } from "./facilities";

export const metadata: Metadata = { title: "Facilities" };

export default function FacilitiesPage() {
  return <RolePage roles={["ADMIN"]}>{() => <Facilities />}</RolePage>;
}
