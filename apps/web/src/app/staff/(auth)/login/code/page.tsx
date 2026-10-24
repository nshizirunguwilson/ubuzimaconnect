import type { Metadata } from "next";
import { CodeForm } from "./form";

export const metadata: Metadata = { title: "Enter your code" };

export default function CodePage() {
  return <CodeForm />;
}
