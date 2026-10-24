"use client";

import { PRESCRIPTION_VALID_DAYS, prescriptionItem, type PrescriptionStatus } from "@ubuzima/shared";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Squircle } from "@/components/ui/squircle";
import { StatusBadge } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { usePending } from "@/lib/pending";
import { formatDate } from "@/lib/time";
import { useT } from "@/i18n/client";

export type Prescription = {
  id: string;
  code: string;
  status: PrescriptionStatus;
  issuedAt: string;
  validUntil: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: { medicine: string; dose: string; frequency: string; days: number; instructions: string | null }[];
  prescriber: { name: string; licence: string | null };
  patient?: string;
};

/** FR 11.3, 11.4: Valid in green; Expired and Cancelled say plainly not to dispense. */
export function PrescriptionStatusBadge({ p }: { p: Pick<Prescription, "status" | "validUntil"> }) {
  const { t, date } = useT();
  if (p.status === "VALID") return <StatusBadge tone="success">{t.prescription.validUntil(date(p.validUntil))}</StatusBadge>;
  return <StatusBadge tone={p.status === "CANCELLED" ? "urgent" : "neutral"}>{p.status === "CANCELLED" ? t.prescription.cancelled : t.prescription.expired}</StatusBadge>;
}

export function Medicines({ items }: { items: Prescription["items"] }) {
  const { t } = useT();
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={i} className="flex flex-col">
          <span className="text-body font-semibold text-fg">{it.medicine}</span>
          <span className="text-small text-fg-secondary">
            {t.prescription.dose(it.dose, it.frequency, it.days)}
            {it.instructions ? `. ${it.instructions}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One prescription: code, status, medicines and who issued it (FR 11.2). */
export function PrescriptionCard({ p, qr, action }: { p: Prescription; qr?: boolean; action?: ReactNode }) {
  const { t, dateTime } = useT();
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-body font-semibold tracking-wide text-fg">{p.code}</span>
          <span className="text-caption text-fg-muted">
            {p.patient ? `${p.patient} · ` : ""}
            {t.prescription.issued(dateTime(p.issuedAt), p.prescriber.name)}
            {p.prescriber.licence ? ` (${p.prescriber.licence})` : ""}
          </span>
        </div>
        <PrescriptionStatusBadge p={p} />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <Medicines items={p.items} />
        </div>
        {qr && p.status === "VALID" && <QrCode code={p.code} />}
      </div>
      {p.status === "CANCELLED" && p.cancelReason && <p className="text-small text-fg-secondary">{t.prescription.cancelledBecause(p.cancelReason)}</p>}
      {action}
    </Card>
  );
}

/**
 * FR 11.2: the QR code holds the public check address, so any phone camera opens the check page (FR 11.7).
 * Black on white, as scanners expect.
 */
export function QrCode({ code, size = 128 }: { code: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const { t } = useT();
  useEffect(() => {
    let live = true;
    QRCode.toString(`${window.location.origin}/check/${code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).then(
      (s) => live && setSvg(s),
      () => null,
    );
    return () => {
      live = false;
    };
  }, [code]);
  return (
    <Squircle radius="md" className="shrink-0 overflow-hidden p-1.5 sq-bg-white sq-border-border" style={{ width: size, height: size }}>
      {svg ? <div role="img" aria-label={t.prescription.qr(code)} className="size-full [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="size-full" aria-busy />}
    </Squircle>
  );
}

type Row = { medicine: string; dose: string; frequency: string; days: string; instructions: string };
const empty = (): Row => ({ medicine: "", dose: "", frequency: "", days: "", instructions: "" });

/** FR 11.1: one or more medicines, each with dose, how often, how many days and instructions. No approval needed. */
export function PrescribeForm({ path, onIssued }: { path: string; onIssued: (p: Prescription) => Promise<void> | void }) {
  const [rows, setRows] = useState<Row[]>([empty()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = usePending(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Check each row here first, so each error sits under its own field.
    const found: Record<string, string> = {};
    rows.forEach((r, i) => {
      const res = prescriptionItem.safeParse(r);
      if (!res.success) for (const issue of res.error.issues) found[`${i}.${String(issue.path[0])}`] ??= issue.message;
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const p = await api<Prescription>(path, { items: rows });
      toast.success(`Prescription ${p.code} issued`);
      setRows([empty()]);
      await onIssued(p);
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.error.message : "Couldn't issue the prescription.");
    } finally {
      setPending(false);
    }
  }

  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {rows.map((r, i) => (
        <fieldset key={i} className="flex flex-col gap-4 border-b border-border pb-5 last-of-type:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-small font-semibold text-fg">Medicine {rows.length > 1 ? i + 1 : ""}</legend>
            {rows.length > 1 && (
              <Button variant="ghost" size="compact" icon={<LuTrash2 />} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            )}
          </div>
          <Input label="Medicine and strength" hint="e.g. Paracetamol 500 mg tablets" value={r.medicine} onChange={(e) => set(i, "medicine", e.target.value)} error={errors[`${i}.medicine`]} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Dose" hint="e.g. 2 tablets" value={r.dose} onChange={(e) => set(i, "dose", e.target.value)} error={errors[`${i}.dose`]} />
            <Input label="How often" hint="e.g. 3 times a day" value={r.frequency} onChange={(e) => set(i, "frequency", e.target.value)} error={errors[`${i}.frequency`]} />
            <Input label="Days" inputMode="numeric" value={r.days} onChange={(e) => set(i, "days", e.target.value.replace(/\D/g, ""))} error={errors[`${i}.days`]} />
          </div>
          <Input label="Instructions" optional hint="e.g. After meals" value={r.instructions} onChange={(e) => set(i, "instructions", e.target.value)} />
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" loading={pending}>
          Issue prescription
        </Button>
        {rows.length < 10 && (
          <Button variant="ghost" icon={<LuPlus />} onClick={() => setRows((rs) => [...rs, empty()])}>
            Add another medicine
          </Button>
        )}
      </div>
      <p className="text-caption text-fg-muted">Valid at any pharmacy for {PRESCRIPTION_VALID_DAYS} days. The patient sees it in their records straight away.</p>
    </form>
  );
}

/** FR 11.6: the patient's whole prescription history, newest first. */
export function PrescriptionHistory({ list }: { list: Prescription[] }) {
  if (list.length === 0) return <p className="text-small text-fg-secondary">No prescriptions before.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {list.map((p) => (
        <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-fg-muted">
              <span className="font-mono">{p.code}</span> · {formatDate(p.issuedAt)} · {p.prescriber.name}
            </span>
            <PrescriptionStatusBadge p={p} />
          </div>
          <Medicines items={p.items} />
        </li>
      ))}
    </ul>
  );
}
