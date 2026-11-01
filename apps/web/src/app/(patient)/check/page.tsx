import type { Metadata } from "next";
import { CheckForm } from "./check-form";

export const metadata: Metadata = { title: "Check a prescription" };

/** The public page pharmacies use. No login. */
export default function Page() {
  return <CheckForm />;
}
