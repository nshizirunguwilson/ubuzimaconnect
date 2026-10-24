import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** On phones the form sits on the page; from 640 px it gets a card. */
export function AuthCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-6 max-sm:p-0 max-sm:sq-bg-transparent max-sm:sq-border-transparent sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{title}</h1>
        {intro && <div className="text-body text-fg-secondary">{intro}</div>}
      </div>
      {children}
    </Card>
  );
}
