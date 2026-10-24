"use client";

import { clinicianInvite, SERVICE_LABEL, SERVICES, type Service } from "@ubuzima/shared";
import { useState, type FormEvent } from "react";
import { LuStethoscope, LuUserPlus } from "react-icons/lu";
import { Confirm } from "@/components/app/confirm";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge, type Tone } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { useApi } from "@/lib/use-api";

type Row = {
  id: string;
  name: string;
  email: string;
  specialty: Service | null;
  licenceNumber: string | null;
  status: "INVITED" | "ACTIVE" | "LOCKED_EMAIL" | "DEACTIVATED";
};

const status: Record<Row["status"], { tone: Tone; label: string }> = {
  ACTIVE: { tone: "success", label: "Active" },
  INVITED: { tone: "info", label: "Invited" },
  LOCKED_EMAIL: { tone: "urgent", label: "Locked" },
  DEACTIVATED: { tone: "neutral", label: "Turned off" },
};

const specialtyOptions = SERVICES.map((s) => ({ value: s, label: SERVICE_LABEL[s] }));

/** FR 8.2: the facility manager's own clinicians: invite, edit, turn off (kept, never deleted). */
export function Clinicians({ facility }: { facility: string }) {
  const { data, reload } = useApi<Row[]>("/clinicians");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clinicians"
        intro={`Clinicians at ${facility}. Each has one specialty, which decides which patients they receive.`}
        action={<ClinicianDialog mode="invite" onDone={reload} />}
      />
      <Card className="overflow-hidden p-0 md:p-0">
        {data === null ? (
          <div className="h-48" aria-busy />
        ) : data.length === 0 ? (
          <EmptyState icon={LuStethoscope} message="No clinicians yet. Invite the first one." />
        ) : (
          <ul className="divide-y divide-border">
            {data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
                <div className="flex min-w-0 flex-1 basis-60 flex-col">
                  <span className="truncate font-semibold text-fg">{c.name}</span>
                  <span className="truncate text-small text-fg-secondary">
                    {c.specialty ? SERVICE_LABEL[c.specialty] : "No specialty"} · {c.licenceNumber ?? "No licence number"} · {c.email}
                  </span>
                </div>
                <StatusBadge tone={status[c.status].tone}>{status[c.status].label}</StatusBadge>
                {c.status !== "DEACTIVATED" && (
                  <div className="flex gap-1">
                    {c.status === "INVITED" && (
                      <Button
                        variant="ghost"
                        size="compact"
                        onClick={async () => {
                          await api(`/clinicians/${c.id}/invitation`, {}).catch(() => null);
                          toast.success(`New invitation sent to ${c.email}`);
                        }}
                      >
                        Send again
                      </Button>
                    )}
                    <ClinicianDialog mode="edit" clinician={c} onDone={reload} />
                    <Confirm
                      trigger={
                        <Button variant="ghost" size="compact">
                          Turn off
                        </Button>
                      }
                      title={`Turn off ${c.name}'s account?`}
                      description="They can't log in or receive patients any more. The account and its history are kept."
                      confirmLabel="Turn off account"
                      onConfirm={async () => {
                        await api(`/clinicians/${c.id}/deactivate`, {});
                        toast.success(`${c.name}'s account turned off`);
                        await reload();
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ClinicianDialog({ mode, clinician, onDone }: { mode: "invite" | "edit"; clinician?: Row; onDone: () => Promise<void> }) {
  const blank = { name: "", email: "", specialty: "", licenceNumber: "" };
  const start = clinician
    ? { name: clinician.name, email: clinician.email, specialty: clinician.specialty ?? "", licenceNumber: clinician.licenceNumber ?? "" }
    : blank;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const formId = `clinician-${clinician?.id ?? "new"}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const schema = mode === "invite" ? clinicianInvite : clinicianInvite.omit({ email: true });
    const r = check(schema, { ...form, specialty: form.specialty || undefined });
    if (!r.data) return setErrors(r.errors);
    setErrors({});
    setPending(true);
    try {
      if (mode === "invite") await api("/clinicians", r.data);
      else await api(`/clinicians/${clinician!.id}`, r.data, { method: "PUT" });
      setOpen(false);
      toast.success(mode === "invite" ? `Invitation sent to ${form.email}` : "Changes saved");
      if (mode === "invite") setForm(blank);
      await onDone();
    } catch (err) {
      if (err instanceof ApiFailure) setErrors(err.error.fields ?? { form: err.error.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setForm(start);
      }}
    >
      <DialogTrigger asChild>
        {mode === "invite" ? (
          <Button variant="primary" icon={<LuUserPlus />}>
            Invite clinician
          </Button>
        ) : (
          <Button variant="ghost" size="compact">
            Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={mode === "invite" ? "Invite clinician" : `Edit ${clinician!.name}`}
        description={mode === "invite" ? "They'll get an email to set their password. The link works for 48 hours." : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId} loading={pending}>
              {mode === "invite" ? "Send invitation" : "Save changes"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Input label="Full name" autoComplete="off" value={form.name} onChange={set("name")} error={errors.name} />
          {mode === "invite" && <Input label="Work email" type="email" autoComplete="off" value={form.email} onChange={set("email")} error={errors.email} />}
          <Select label="Specialty" placeholder="Choose a specialty" options={specialtyOptions} value={form.specialty} onChange={set("specialty")} error={errors.specialty} />
          <Input label="Licence number" autoComplete="off" value={form.licenceNumber} onChange={set("licenceNumber")} error={errors.licenceNumber} hint="From the professional council, e.g. RMDC-04521" />
          {errors.form && <p className="text-small font-medium text-urgent-fg">{errors.form}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
