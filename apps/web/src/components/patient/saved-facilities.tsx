"use client";

import { useSyncExternalStore } from "react";
import { LuPhone } from "react-icons/lu";
import { Card } from "@/components/ui/card";
import { NEARBY_KEY, type NearbyFacility } from "@/lib/nearby";
import { useT } from "@/i18n/client";

const noop = () => () => {};

/**
 * FR 3.10, 1.9: the nearest facilities saved on this device when the last request started, for when
 * there is no connection. Marked "Availability not confirmed": beds and staff may have changed since.
 */
export function SavedFacilities({ list }: { list?: NearbyFacility[] }) {
  // Read from the device after it renders; the server has nothing saved.
  const { t } = useT();
  const raw = useSyncExternalStore(noop, () => localStorage.getItem(NEARBY_KEY), () => null);
  const saved: NearbyFacility[] = list ?? (raw ? JSON.parse(raw).list : []);

  if (saved.length === 0) return <p className="text-small text-fg-secondary">{t.saved.none}</p>;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col">
        <p className="text-small font-medium text-warning-fg">{t.saved.unconfirmed}</p>
        <p className="text-caption text-fg-muted">{t.saved.from}</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {saved.map((f) => (
          <li key={f.name} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="font-semibold text-fg">{f.name}</span>
              <span className="text-small text-fg-secondary">{f.distance}</span>
            </div>
            {f.phone && (
              <a href={`tel:${f.phone.replace(/\s/g, "")}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-small font-medium text-link">
                <LuPhone className="size-4" aria-hidden />
                {t.saved.call}
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
