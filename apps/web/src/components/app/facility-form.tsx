"use client";

import {
  DISTRICTS,
  FACILITY_LEVELS,
  facilityProfile,
  LEVEL_LABEL,
  SERVICE_LABEL,
  SERVICES,
  type FacilityLevel,
  type FacilityProfile,
  type Service,
} from "@ubuzima/shared";
import { useState, type FormEvent } from "react";
import { LuLocateFixed } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { check } from "@/lib/form";

export type FacilityValues = {
  name: string;
  level: FacilityLevel | "";
  services: Service[];
  district: string;
  sector: string;
  latitude: string;
  longitude: string;
  phone: string;
  active: boolean;
};

export const emptyFacility: FacilityValues = {
  name: "",
  level: "",
  services: [],
  district: "",
  sector: "",
  latitude: "",
  longitude: "",
  phone: "",
  active: true,
};

const districtOptions = Object.entries(DISTRICTS).flatMap(([province, ds]) => ds.map((d) => ({ value: d, label: `${d} · ${province}` })));

/**
 * FR 8.1 and 12.1: the capability profile that routing uses. Services from the fixed list,
 * level of care, location, active or inactive.
 */
export function FacilityForm({
  id,
  initial,
  onSubmit,
  serverErrors,
  showActive = true,
}: {
  id: string;
  initial: FacilityValues;
  onSubmit: (data: FacilityProfile) => Promise<void>;
  serverErrors?: Record<string, string>;
  showActive?: boolean;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locating, setLocating] = useState(false);
  const all = { ...errors, ...serverErrors };
  const set = (k: keyof FacilityValues) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  function locate() {
    if (!navigator.geolocation) return setErrors({ latitude: "This browser can't share a location. Type it instead." });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setV((x) => ({ ...x, latitude: p.coords.latitude.toFixed(5), longitude: p.coords.longitude.toFixed(5) }));
        setLocating(false);
      },
      () => {
        setErrors({ latitude: "Location permission was refused. Type the coordinates instead." });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(facilityProfile, { ...v, level: v.level || undefined, sector: v.sector || undefined, phone: v.phone || undefined });
    if (!r.data) return setErrors(r.errors);
    setErrors({});
    await onSubmit(r.data);
  }

  return (
    <form id={id} onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Input label="Facility name" value={v.name} onChange={set("name")} error={all.name} autoComplete="off" />
      <Select
        label="Level of care"
        placeholder="Choose a level"
        options={FACILITY_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
        value={v.level}
        onChange={set("level")}
        error={all.level}
      />

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-small font-medium text-fg">Services offered</legend>
        <p className="mb-1 text-small text-fg-secondary">Patients are only routed here for these services.</p>
        <div className="grid sm:grid-cols-2">
          {SERVICES.map((svc) => (
            <Checkbox
              key={svc}
              label={SERVICE_LABEL[svc]}
              checked={v.services.includes(svc)}
              onChange={(e) =>
                setV((x) => ({ ...x, services: e.target.checked ? [...x.services, svc] : x.services.filter((s) => s !== svc) }))
              }
            />
          ))}
        </div>
        {all.services && <p className="text-small font-medium text-urgent-fg">{all.services}</p>}
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <Select label="District" placeholder="Choose a district" options={districtOptions} value={v.district} onChange={set("district")} error={all.district} />
        <Input label="Sector" optional value={v.sector} onChange={set("sector")} error={all.sector} autoComplete="off" />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-small font-medium text-fg">Location</legend>
        <p className="text-small text-fg-secondary">Used to find the nearest facility for a patient (straight-line distance).</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <Input label="Latitude" inputMode="decimal" mono value={v.latitude} onChange={set("latitude")} error={all.latitude} placeholder="-1.94410" />
          <Input label="Longitude" inputMode="decimal" mono value={v.longitude} onChange={set("longitude")} error={all.longitude} placeholder="30.06190" />
        </div>
        <Button variant="secondary" size="compact" icon={<LuLocateFixed />} onClick={locate} loading={locating} className="self-start">
          Use my current location
        </Button>
      </fieldset>

      <Input label="Phone number" optional type="tel" value={v.phone} onChange={set("phone")} error={all.phone} hint="Shown to patients routed here" />

      {showActive && (
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex flex-col">
            <span className="text-body font-medium text-fg">Accepting patients</span>
            <span className="text-small text-fg-secondary">When off, no patient is routed here.</span>
          </div>
          <Switch label="Accepting patients" checked={v.active} onChange={(active) => setV((x) => ({ ...x, active }))} />
        </div>
      )}
    </form>
  );
}
