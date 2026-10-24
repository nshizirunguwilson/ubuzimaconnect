"use client";

import { ROLE_LABEL, type StaffRole } from "@ubuzima/shared";
import { useEffect, useState } from "react";
import { ActivityList, useActivity } from "@/components/app/activity-list";
import { PageHeader } from "@/components/app/page-header";
import { Select } from "@/components/ui/field";
import { api } from "@/lib/api";

/** FR 10.3: a facility manager sees their own staff; the administrator sees every user. */
export function StaffActivity({ admin, facility }: { admin: boolean; facility: string | null }) {
  const [staffId, setStaffId] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string; role: StaffRole }[]>([]);
  const feed = useActivity(`/activity${staffId ? `?staffId=${staffId}` : ""}`);

  useEffect(() => {
    api<{ people: typeof people }>("/activity").then((r) => setPeople(r.people), () => null);
  }, []);

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <PageHeader
        title="Activity"
        intro={admin ? "What every user did, newest first: logins, records opened, care given and settings changed." : `What the staff of ${facility ?? "your facility"} did, newest first.`}
      />
      <Select
        label="Person"
        className="max-w-[360px]"
        placeholder={admin ? "Everyone" : "All your staff"}
        options={people.map((p) => ({ value: p.id, label: `${p.name} · ${ROLE_LABEL[p.role]}` }))}
        value={staffId}
        onChange={(e) => setStaffId(e.target.value)}
      />
      <ActivityList key={staffId} feed={feed} />
    </div>
  );
}
