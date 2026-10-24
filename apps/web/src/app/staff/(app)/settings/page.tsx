import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { Settings } from "./settings";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <RolePage roles={["ADMIN"]}>{() => <Settings />}</RolePage>;
}
