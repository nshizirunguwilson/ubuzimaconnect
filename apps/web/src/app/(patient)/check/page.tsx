import type { Metadata } from "next";
import { CheckForm } from "./check-form";

export const metadata: Metadata = { title: "Check a prescription" };

/** FR 11.7: the public page pharmacies use. No login. */
export default function Page() {
  return <CheckForm />;
}
