import type { Metadata } from "next";
import { RolePage } from "@/components/app/role-page";
import { RedFlags } from "./red-flags";

export const metadata: Metadata = { title: "Red-flag list" };

export default function Page() {
  return <RolePage roles={["ADMIN"]}>{() => <RedFlags />}</RolePage>;
}
