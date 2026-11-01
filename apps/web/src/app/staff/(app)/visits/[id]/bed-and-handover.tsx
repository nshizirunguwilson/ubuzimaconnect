"use client";

import { SERVICE_LABEL, formatKm, type Service } from "@ubuzima/shared";
import { useState } from "react";
import { LuBedDouble } from "react-icons/lu";
import { Confirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { usePending } from "@/lib/pending";
import { useApi } from "@/lib/use-api";
import type { View } from "./visit";

export type Target = {
  facility: {
    id: string;
    name: string;
    phone: string | null;
    freeBeds: number;
  };
  km: number;
  clinician: { name: string; specialty: Service | null } | null;
} | null;

/** Assign a free bed; with none free, transfer to the nearest facility that has one. */
export function Bed({
  data,
  onChanged,
  onTransferred,
}: {
  data: View;
  onChanged: () => Promise<void>;
  onTransferred: (m: string) => void;
}) {
  const [pending, setPending] = usePending(false);
  const [target, setTarget] = useState<Target | undefined>();
  const noneFree = data.bed === "NONE" && data.facility.freeBeds <= 0;

  async function assign() {
    setPending(true);
    try {
      await api(`/clinician/visits/${data.id}/bed`, {});
      toast.success("Bed assigned");
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.error.message : "Couldn't assign a bed.");
    } finally {
      setPending(false);
      await onChanged();
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h3 text-fg">Bed</h2>
        {data.bed === "USED" ? (
          <StatusBadge tone="success" icon={<LuBedDouble aria-hidden />}>
            Bed assigned
          </StatusBadge>
        ) : (
          <span className="text-small text-fg-secondary">
            {data.facility.freeBeds} free {data.facility.freeBeds === 1 ? "bed" : "beds"} here
          </span>
        )}
      </div>
      {data.bed === "USED" ? (
        <p className="text-small text-fg-secondary">It is freed when the patient is discharged.</p>
      ) : !noneFree ? (
        <Button variant="secondary" loading={pending} onClick={assign} className="w-full">
          Assign a bed
        </Button>
      ) : (
        <>
          <Notice tone="warning" title="No bed is free here">
            If the patient needs a bed, transfer them to the nearest facility that has one.
          </Notice>
          {target === undefined ? (
            <Button
              variant="secondary"
              loading={pending}
              className="w-full"
              onClick={async () => {
                setPending(true);
                try {
                  setTarget(await api<Target>(`/clinician/visits/${data.id}/transfer`));
                } catch (err) {
                  toast.error(err instanceof ApiFailure ? err.error.message : "Couldn't look for a facility.");
                } finally {
                  setPending(false);
                }
              }}
            >
              Find a facility for transfer
            </Button>
          ) : target === null ? (
            <Notice tone="urgent" title="No other facility has a free bed and this specialty on duty">
              Call 912 for an ambulance transfer.
            </Notice>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-small text-fg">
                <span className="font-semibold">{target.facility.name}</span> · {formatKm(target.km)} ·{" "}
                {target.facility.freeBeds} free beds
                {target.clinician ? ` · ${target.clinician.name} will attend` : ""}
              </p>
              <Confirm
                trigger={
                  <Button variant="secondary" className="w-full">
                    Transfer to {target.facility.name}
                  </Button>
                }
                title={`Transfer to ${target.facility.name}?`}
                description="A bed is held there and their clinician is told the patient is coming. This visit closes as Transferred and you can no longer open the record."
                confirmLabel="Transfer"
                variant="primary"
                onConfirm={async () => {
                  const result = await api<{ facility: string }>(`/clinician/visits/${data.id}/transfer`, {});
                  onTransferred(`Transferred to ${result.facility}`);
                }}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** To an on-duty colleague at this facility, who is told; this clinician's access ends. */
export function Handover({ id, onDone }: { id: string; onDone: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: colleagues } = useApi<
    {
      id: string;
      name: string;
      specialty: Service | null;
      activePatients: number;
    }[]
  >(open ? `/clinician/visits/${id}/colleagues` : null);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = usePending(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full">
          Hand over
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Hand over this patient"
        description="Your colleague becomes the attending clinician and is told at once. You can no longer open the record."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="handover" loading={pending} disabled={!colleagues?.length}>
              Hand over
            </Button>
          </>
        }
      >
        <form
          id="handover"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            try {
              const result = await api<{ to: string }>(`/clinician/visits/${id}/handover`, {
                clinicianId: to || undefined,
              });
              onDone(`Handed over to ${result.to}`);
            } catch (err) {
              setPending(false);
              setError(
                err instanceof ApiFailure
                  ? (err.error.fields?.clinicianId ?? err.error.message)
                  : "Couldn't hand over.",
              );
            }
          }}
        >
          {!colleagues ? (
            <div className="h-20" aria-busy />
          ) : colleagues.length === 0 ? (
            <Notice tone="info" title="No colleague is on duty here right now" />
          ) : (
            <Select
              label="Colleague on duty"
              placeholder="Choose a colleague"
              options={colleagues.map((colleague) => ({
                value: colleague.id,
                label: `${colleague.name} · ${colleague.specialty ? SERVICE_LABEL[colleague.specialty] : "no specialty"} · ${colleague.activePatients} patients`,
              }))}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              error={error}
            />
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
