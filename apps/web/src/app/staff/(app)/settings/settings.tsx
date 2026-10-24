"use client";

import { useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";

type S = { aiEnabled: boolean; updatedAt: string; updatedBy: string | null };

/** FR 4.8: the AI switch. While it is off, every new case goes to the agents as Uncertain. */
export function Settings() {
  const { data, reload } = useApi<S>("/settings");
  const [pending, setPending] = useState(false);
  if (!data) return <div className="h-64" aria-busy />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <Card className="flex max-w-[720px] flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-h3 text-fg">AI triage suggestions</h2>
            <p className="text-small text-fg-secondary">
              The AI suggests a category and urgency for cases with no red flag. An agent reviews every case either way.
            </p>
          </div>
          <Switch
            label="AI triage suggestions"
            checked={data.aiEnabled}
            disabled={pending}
            onChange={async (aiEnabled) => {
              setPending(true);
              try {
                await api("/settings", { aiEnabled }, { method: "PUT" });
                toast.success(aiEnabled ? "AI suggestions turned on" : "AI suggestions turned off");
                await reload();
              } catch {
                toast.error("Couldn't change the setting. Try again.");
              } finally {
                setPending(false);
              }
            }}
          />
        </div>
        {!data.aiEnabled && (
          <Notice tone="warning" title="AI is off">
            New cases skip the AI and go to the agents as Uncertain. Red-flag rules still apply.
          </Notice>
        )}
        <p className="text-caption text-fg-muted">
          {data.updatedBy ? `Last changed by ${data.updatedBy}, ${formatDateTime(data.updatedAt)}` : "Not changed yet"}
        </p>
      </Card>
    </div>
  );
}
