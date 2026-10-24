import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComponentSheet } from "./sheet";

export const metadata: Metadata = { title: "Component sheet", robots: { index: false } };

// Review tool for Stage 2; not part of the product, so it is hidden in production.
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ComponentSheet />;
}
