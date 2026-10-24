"use client";

import { useCallback, useEffect, useState } from "react";
import { LuHistory, LuLaptop, LuSmartphone, LuTablet } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useT } from "@/i18n/client";

export type ActivityRow = {
  id: string;
  at: string;
  action: string;
  what: string;
  /** The action in words, without the code, so the patient app can translate it (NFR 7) */
  label: string;
  code: string | null;
  who: { name: string; role: string | null };
  device: string | null;
};
type Page = { rows: ActivityRow[]; next: string | null };

/** Loads an activity list 50 rows at a time, newest first (FR 10.2, 10.3). */
export function useActivity(path: string) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    api<Page>(path).then(
      (p) => {
        if (!live) return;
        setRows(p.rows);
        setNext(p.next);
      },
      () => live && setRows([]),
    );
    return () => {
      live = false;
    };
  }, [path]);

  const more = useCallback(async () => {
    if (!next) return;
    setLoading(true);
    try {
      const p = await api<Page>(`${path}${path.includes("?") ? "&" : "?"}before=${next}`);
      setRows((r) => [...(r ?? []), ...p.rows]);
      setNext(p.next);
    } finally {
      setLoading(false);
    }
  }, [next, path]);

  return { rows, hasMore: !!next, loading, more };
}

const DEVICE = { phone: { Icon: LuSmartphone, label: "Phone" }, tablet: { Icon: LuTablet, label: "Tablet" }, computer: { Icon: LuLaptop, label: "Computer" } } as const;

/** When, what and who, grouped by day; logins show the device type. */
export function ActivityList({ feed }: { feed: ReturnType<typeof useActivity> }) {
  const { t, tr, date, time } = useT();
  if (!feed.rows) return <div className="h-64" aria-busy />;
  if (feed.rows.length === 0)
    return (
      <Card className="p-0 md:p-0">
        <EmptyState icon={LuHistory} message={t.activity.empty} />
      </Card>
    );

  const days = new Map<string, ActivityRow[]>();
  for (const r of feed.rows) days.set(date(r.at), [...(days.get(date(r.at)) ?? []), r]);

  return (
    <div className="flex flex-col gap-6">
      {[...days].map(([day, rows]) => (
        <section key={day} className="flex flex-col gap-2" aria-label={day}>
          <h2 className="text-small font-semibold text-fg-secondary">{day}</h2>
          <Card className="p-0 md:p-0">
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const d = r.device && r.device in DEVICE ? DEVICE[r.device as keyof typeof DEVICE] : null;
                return (
                  <li key={r.id} className="flex items-start gap-4 px-4 py-3 md:px-6">
                    <span className="w-12 shrink-0 pt-0.5 text-small text-fg-secondary tabular-nums">{time(r.at)}</span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body text-fg">
                        {tr(r.label)}
                        {r.code ? ` ${r.code}` : ""}
                      </span>
                      <span className="text-small text-fg-secondary">
                        {tr(r.who.name)}
                        {r.who.role ? ` · ${tr(r.who.role)}` : ""}
                      </span>
                    </div>
                    {d && (
                      <span className="flex shrink-0 items-center gap-1.5 text-small text-fg-secondary">
                        <d.Icon className="size-4" aria-hidden />
                        {t.activity.devices[r.device!] ?? d.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}
      {feed.hasMore && (
        <Button variant="secondary" loading={feed.loading} onClick={feed.more} className="self-start">
          {t.activity.older}
        </Button>
      )}
    </div>
  );
}
