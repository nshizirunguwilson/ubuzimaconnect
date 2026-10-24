import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Alerts } from "./alerts";

export const metadata: Metadata = { title: "Alerts" };

export default function Page() {
  return <RolePage roles={["ADMIN"]}>{() => <Alerts />}</RolePage>;
}
