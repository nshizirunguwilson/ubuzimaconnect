"use client";

import { LEVEL_LABEL, SERVICE_LABEL, type FacilityLevel, type Service } from "@ubuzima/shared";
import { useState } from "react";
import { LuBuilding2, LuPlus } from "react-icons/lu";
import { emptyFacility, FacilityForm } from "@/components/app/facility-form";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Row = {
  id: string;
  name: string;
  level: FacilityLevel;
  services: Service[];
  district: string;
  totalBeds: number;
  availableBeds: number;
  active: boolean;
  managers: string[];
};

/** FR 12.1: the administrator creates facilities; their managers then keep the profile up to date (FR 8.1). */
export function Facilities() {
  const { data, reload } = useApi<Row[]>("/facilities");
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>();
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Facilities"
        intro="Every facility patients can be routed to. Add a facility, then invite its manager from Staff accounts."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="primary" icon={<LuPlus />}>
                Add facility
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Add facility"
              actions={
                <>
                  <Button variant="secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" form="new-facility" loading={pending}>
                    Add facility
                  </Button>
                </>
              }
            >
              <FacilityForm
                id="new-facility"
                initial={emptyFacility}
                serverErrors={errors}
                showActive={false}
                onSubmit={async (body) => {
                  setPending(true);
                  try {
                    await api("/facilities", body);
                    setOpen(false);
                    setErrors(undefined);
                    toast.success(`${body.name} added`);
                    await reload();
                  } catch (e) {
                    if (e instanceof ApiFailure) setErrors(e.error.fields ?? { name: e.error.message });
                  } finally {
                    setPending(false);
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="overflow-hidden p-0 md:p-0">
        {data === null ? (
          <div className="h-48" aria-busy />
        ) : data.length === 0 ? (
          <EmptyState icon={LuBuilding2} message="No facilities yet. Add the first one." />
        ) : (
          <table className="w-full text-left text-small">
            <thead className="border-b border-border text-caption text-fg-muted max-md:sr-only">
              <tr>
                <th className="px-4 py-3 font-medium md:px-6">Facility</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Free beds</th>
                <th className="px-4 py-3 font-medium md:pr-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((f) => (
                <tr key={f.id} className="max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3">
                  <td className="md:px-6 md:py-3 max-md:w-full">
                    <span className="block font-semibold text-fg">{f.name}</span>
                    <span className="block text-fg-secondary">
                      {LEVEL_LABEL[f.level]} · {f.district}
                      {f.managers.length > 0 ? ` · Manager: ${f.managers.join(", ")}` : " · No manager yet"}
                    </span>
                  </td>
                  <td className="text-fg-secondary md:px-4 md:py-3 max-md:w-full">{f.services.map((s) => SERVICE_LABEL[s]).join(", ")}</td>
                  <td className="whitespace-nowrap text-fg tabular-nums md:px-4 md:py-3 md:text-right">
                    {f.availableBeds} <span className="text-fg-muted">of {f.totalBeds}</span>
                  </td>
                  <td className="md:px-4 md:py-3 md:pr-6">
                    {f.active ? <StatusBadge tone="success">Accepting patients</StatusBadge> : <StatusBadge tone="neutral">Not accepting</StatusBadge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
