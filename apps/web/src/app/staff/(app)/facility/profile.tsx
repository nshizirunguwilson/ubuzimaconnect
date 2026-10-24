"use client";

import { bedCapacity, type FacilityLevel, type Service } from "@ubuzima/shared";
import { useState, type FormEvent } from "react";
import { FacilityForm, type FacilityValues } from "@/components/app/facility-form";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { formatDateTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";

type Mine = {
  id: string;
  name: string;
  level: FacilityLevel;
  services: Service[];
  district: string;
  sector: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  active: boolean;
  totalBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  availableBeds: number;
  updatedAt: string;
};

/** FR 8.1 and 8.3: the manager keeps their facility's profile and bed count correct, because routing uses them. */
export function FacilityProfilePage() {
  const { data, reload, error } = useApi<Mine>("/facilities/mine");
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, setPending] = useState(false);

  if (error) return <Notice tone="warning" title="No facility">{error}</Notice>;
  if (!data) return <div className="h-96" aria-busy />;

  const initial: FacilityValues = {
    name: data.name,
    level: data.level,
    services: data.services,
    district: data.district,
    sector: data.sector ?? "",
    latitude: String(data.latitude),
    longitude: String(data.longitude),
    phone: data.phone ?? "",
    active: data.active,
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={data.name}
        intro={`The system uses this profile to decide which patients come here. Last changed ${formatDateTime(data.updatedAt)}.`}
      />
      {!data.active && (
        <Notice tone="warning" title="Not accepting patients">
          No patient is routed here until you turn &quot;Accepting patients&quot; back on.
        </Notice>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex flex-col gap-6">
          <h2 className="text-h2 text-fg">Profile</h2>
          <FacilityForm
            key={data.updatedAt}
            id="profile"
            initial={initial}
            serverErrors={errors}
            onSubmit={async (body) => {
              setPending(true);
              try {
                await api("/facilities/mine", body, { method: "PUT" });
                setErrors(undefined);
                toast.success("Profile saved");
                await reload();
              } catch (e) {
                if (e instanceof ApiFailure) setErrors(e.error.fields ?? { name: e.error.message });
              } finally {
                setPending(false);
              }
            }}
          />
          <Button variant="primary" type="submit" form="profile" loading={pending} className="self-start">
            Save profile
          </Button>
        </Card>
        <Beds data={data} onSaved={reload} />
      </div>
    </div>
  );
}

function Beds({ data, onSaved }: { data: Mine; onSaved: () => Promise<void> }) {
  const [total, setTotal] = useState(String(data.totalBeds));
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const inUse = data.occupiedBeds + data.reservedBeds;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(bedCapacity, { totalBeds: total });
    if (!r.data) return setError(r.errors.totalBeds);
    setPending(true);
    try {
      await api("/facilities/mine/beds", r.data, { method: "PUT" });
      setError(undefined);
      toast.success("Bed count saved");
      await onSaved();
    } catch (err) {
      if (err instanceof ApiFailure) setError(err.error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-h2 text-fg">Beds</h2>
      <dl className="grid grid-cols-3 gap-3 text-center">
        {[
          ["Free", data.availableBeds],
          ["Occupied", data.occupiedBeds],
          ["Reserved", data.reservedBeds],
        ].map(([label, n]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-caption text-fg-muted">{label}</dt>
            <dd className="font-heading text-h1 font-semibold text-fg tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 border-t border-border pt-4">
        <Input
          label="Total beds"
          inputMode="numeric"
          value={total}
          onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))}
          error={error}
          hint={inUse > 0 ? `Can't be lower than ${inUse}, the beds in use now.` : "Free beds are worked out from this."}
        />
        <Button type="submit" variant="secondary" loading={pending} className="self-start">
          Save bed count
        </Button>
      </form>
    </Card>
  );
}
