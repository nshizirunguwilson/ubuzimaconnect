"use client";

import { useEffect, useState } from "react";
import { LuMapPin, LuPhone } from "react-icons/lu";
import { ButtonLink } from "@/components/ui/button-link";
import { SavedFacilities } from "@/components/patient/saved-facilities";
import { Card } from "@/components/ui/card";
import { readNearby, type NearbyFacility } from "@/lib/nearby";
import { useT } from "@/i18n/client";

type Facility = { name: string; phone: string | null; distance: string };
type State =
  | { kind: "finding" }
  | { kind: "found"; facility: Facility }
  | { kind: "none" }
  | { kind: "offline"; saved: NearbyFacility[] }
  | { kind: "no-location" };

/**
 * The nearest active facility with emergency care and a clinician on duty, without login.
 * Without internet: the facilities saved on this device when a case was started.
 */
export function NearestEmergency() {
  const [state, setState] = useState<State>({ kind: "finding" });
  const { t } = useT();

  useEffect(() => {
    const offline = () => {
      const saved = readNearby();
      return saved?.list.length ? { kind: "offline" as const, saved: saved.list } : { kind: "no-location" as const };
    };
    if (!navigator.geolocation) return void setTimeout(() => setState(offline()), 0);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const answer = await fetch(
            `/api/public/emergency?lat=${position.coords.latitude}&lng=${position.coords.longitude}`,
          ).then((response) => response.json());
          setState(answer.facility ? { kind: "found", facility: answer.facility } : { kind: "none" });
        } catch {
          setState(offline());
        }
      },
      () => setState(offline()),
      { timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  if (state.kind === "finding") {
    return (
      <p className="flex items-center gap-2 text-small text-fg-secondary" aria-live="polite">
        <LuMapPin className="size-4" aria-hidden />
        {t.emergency.finding}
      </p>
    );
  }
  if (state.kind === "found") {
    const facility = state.facility;
    return (
      <Card className="flex flex-col gap-3" aria-live="polite">
        <div className="flex flex-col gap-1">
          <p className="text-caption text-fg-muted">{t.emergency.nearest(facility.distance)}</p>
          <h2 className="text-h2 text-fg">{facility.name}</h2>
        </div>
        {facility.phone && (
          <ButtonLink
            href={`tel:${facility.phone.replace(/\s/g, "")}`}
            variant="secondary"
            icon={<LuPhone />}
            className="self-start"
          >
            {t.emergency.callNumber(facility.phone)}
          </ButtonLink>
        )}
      </Card>
    );
  }
  if (state.kind === "offline") return <SavedFacilities list={state.saved} />;
  if (state.kind === "none") {
    return <p className="text-small text-fg-secondary">{t.emergency.none}</p>;
  }
  return <p className="text-small text-fg-secondary">{t.emergency.noLocation}</p>;
}
