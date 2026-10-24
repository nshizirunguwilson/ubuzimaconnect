"use client";

import { ADMIN_INVITE_ROLES, invitation, ROLE_LABEL, type StaffRole } from "@ubuzima/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LuUserPlus, LuUsers } from "react-icons/lu";
import { Confirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge, type Tone } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { formatDateTime } from "@/lib/time";

type Row = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  status: "INVITED" | "ACTIVE" | "LOCKED_EMAIL" | "DEACTIVATED";
  facility: { id: string; name: string } | null;
  lastLoginAt: string | null;
};
type Facility = { id: string; name: string; district: string };

const status: Record<Row["status"], { tone: Tone; label: string }> = {
  ACTIVE: { tone: "success", label: "Active" },
  INVITED: { tone: "info", label: "Invited" },
  LOCKED_EMAIL: { tone: "urgent", label: "Locked" },
  DEACTIVATED: { tone: "neutral", label: "Turned off" },
};


/** FR 12.1 and 2.6: the administrator sees every staff account and invites agents and facility managers. */
export function Team({ meId }: { meId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const load = useCallback(() => api<Row[]>("/staff").then(setRows), []);

  useEffect(() => {
    void load();
    void api<Facility[]>("/staff/facilities").then(setFacilities);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-fg">Staff accounts</h1>
          <p className="text-body text-fg-secondary">
            Everyone who can log in to the staff app. New people get an email to set their password.
          </p>
        </div>
        <InviteDialog facilities={facilities} onInvited={load} />
      </div>

      <Card className="overflow-hidden p-0 md:p-0">
        {rows === null ? (
          <div className="h-48" aria-busy />
        ) : rows.length === 0 ? (
          <EmptyState icon={LuUsers} message="No staff accounts yet." />
        ) : (
          <table className="w-full text-left text-small">
            <thead className="border-b border-border text-caption text-fg-muted max-md:sr-only">
              <tr>
                <th className="px-4 py-3 font-medium md:px-6">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium md:px-6">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3">
                  <td className="md:px-6 md:py-3 max-md:w-full">
                    <span className="block font-semibold text-fg">{r.name}</span>
                    <span className="block text-fg-secondary">{r.email}</span>
                  </td>
                  <td className="text-fg md:px-4 md:py-3">
                    {ROLE_LABEL[r.role]}
                    {r.facility && <span className="block text-fg-secondary">{r.facility.name}</span>}
                  </td>
                  <td className="md:px-4 md:py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={status[r.status].tone}>{status[r.status].label}</StatusBadge>
                      {r.status === "INVITED" && <ResendInvitation id={r.id} email={r.email} />}
                      {r.status !== "DEACTIVATED" && r.id !== meId && <AccountActions row={r} onDone={load} />}
                    </div>
                  </td>
                  <td className="text-fg-secondary tabular-nums md:px-6 md:py-3 md:text-right max-md:w-full">
                    {r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "Never"}
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

/** FR 12.2 and 12.3: turn an account off (kept, never deleted) or move it to a new email. */
function AccountActions({ row, onDone }: { row: Row; onDone: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(row.email);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="compact">
            Change email
          </Button>
        </DialogTrigger>
        <DialogContent
          title={`Change ${row.name}'s email`}
          description="Unlock codes and reset links go to the new address. Links already sent stop working."
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form={`email-${row.id}`} loading={pending}>
                Save email
              </Button>
            </>
          }
        >
          <form
            id={`email-${row.id}`}
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              try {
                await api(`/staff/${row.id}/email`, { email }, { method: "PUT" });
                toast.success("Email changed");
                setOpen(false);
                await onDone();
              } catch (err) {
                if (err instanceof ApiFailure) setError(err.error.fields?.email ?? err.error.message);
              } finally {
                setPending(false);
              }
            }}
          >
            <Input label="New email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          </form>
        </DialogContent>
      </Dialog>
      <Confirm
        trigger={
          <Button variant="ghost" size="compact">
            Turn off
          </Button>
        }
        title={`Turn off ${row.name}'s account?`}
        description="They can't log in any more and are logged out now. The account and its history are kept."
        confirmLabel="Turn off account"
        onConfirm={async () => {
          await api(`/staff/${row.id}/deactivate`, {});
          toast.success(`${row.name}'s account turned off`);
          await onDone();
        }}
      />
    </>
  );
}

/** FR 2.6: a new link when the first one wasn't used within 48 hours. */
function ResendInvitation({ id, email }: { id: string; email: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="compact"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api(`/staff/${id}/invitation`, {});
          toast.success(`New invitation sent to ${email}`);
        } catch (err) {
          toast.error(err instanceof ApiFailure ? err.error.message : "Couldn't send. Try again.");
        } finally {
          setPending(false);
        }
      }}
    >
      Send again
    </Button>
  );
}

function InviteDialog({ facilities, onInvited }: { facilities: Facility[]; onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "", facilityId: "", licenceNumber: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const role = form.role as StaffRole | "";
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(invitation, {
      ...form,
      role: form.role || undefined,
      facilityId: role === "FACILITY_MANAGER" ? form.facilityId || undefined : undefined,
      licenceNumber: role === "AGENT" ? form.licenceNumber || undefined : undefined,
    });
    if (!r.data) return setErrors(r.errors);
    setErrors({});
    setPending(true);
    try {
      await api("/staff/invitations", r.data);
      setOpen(false);
      setForm({ name: "", email: "", role: "", facilityId: "", licenceNumber: "" });
      toast.success(`Invitation sent to ${r.data.email}`);
      onInvited();
    } catch (err) {
      if (err instanceof ApiFailure) setErrors(err.error.fields ?? { form: err.error.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" icon={<LuUserPlus />}>
          Invite staff
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Invite staff"
        description="They'll get an email with a link to set their password. The link works for 48 hours."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="invite" loading={pending}>
              Send invitation
            </Button>
          </>
        }
      >
        <form id="invite" onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Input label="Full name" autoComplete="off" value={form.name} onChange={set("name")} error={errors.name} />
          <Input label="Work email" type="email" autoComplete="off" value={form.email} onChange={set("email")} error={errors.email} />
          <Select
            label="Role"
            placeholder="Choose a role"
            options={ADMIN_INVITE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            value={form.role}
            onChange={set("role")}
            error={errors.role}
          />
          {role === "FACILITY_MANAGER" && (
            <Select
              label="Facility"
              placeholder="Choose a facility"
              options={facilities.map((f) => ({ value: f.id, label: `${f.name} · ${f.district}` }))}
              value={form.facilityId}
              onChange={set("facilityId")}
              error={errors.facilityId}
            />
          )}
          {role === "AGENT" && (
            <Input
              label="Licence number"
              hint="From the professional council, e.g. RNMC-22817"
              autoComplete="off"
              value={form.licenceNumber}
              onChange={set("licenceNumber")}
              error={errors.licenceNumber}
            />
          )}
          {errors.form && <p className="text-small font-medium text-urgent-fg">{errors.form}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
