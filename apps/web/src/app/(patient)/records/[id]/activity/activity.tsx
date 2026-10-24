"use client";

import { BackLink } from "@/components/patient/back-link";
import { ActivityList, useActivity } from "@/components/app/activity-list";
import { useT } from "@/i18n/client";

/** FR 10.2: every action on these records, by anyone including the patient, with the device for logins. */
export function Activity({ id }: { id: string }) {
  const feed = useActivity(`/records/${id}/activity`);
  const { t } = useT();
  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[720px]">
      <BackLink href={`/records/${id}`} label={t.records.title} />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t.activity.title}</h1>
        <p className="text-body text-fg-secondary">{t.activity.intro}</p>
      </div>
      <ActivityList feed={feed} />
    </main>
  );
}
