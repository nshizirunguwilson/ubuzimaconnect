"use client";

import { DURATION_LABEL, OUTCOME_LABEL, SERVICE_LABEL, formatKm, type Duration, type Service } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LuArrowLeft, LuBedDouble, LuPencil } from "react-icons/lu";
import { Avatar } from "@/components/app/avatar";
import { PrescribeForm, PrescriptionHistory, type Prescription } from "@/components/app/prescription";
import { Confirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusBadge, TriageBadge, type TriageLevel } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { usePending } from "@/lib/pending";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";

type Level = "URGENT" | "UNCERTAIN" | "MINOR";
type Version = {
  id: string;
  version: number;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  by: string;
  at: string;
};
type View = {
  id: string;
  facility: { id: string; name: string; freeBeds: number };
  arrivedAt: string;
  service: Service;
  bed: "USED" | "NONE";
  reason: string | null;
  patient: {
    id: string;
    name: string;
    sex: "FEMALE" | "MALE";
    ageLabel: string;
    dateOfBirth: string;
    district: string | null;
    photoUrl: string | null;
  };
  case: {
    id: string;
    code: string;
    level: Level | null;
    reason: string | null;
    pregnant: boolean | null;
    answers: { code: string; text: string; answer: boolean }[];
    description: string | null;
    duration: Duration | null;
    severity: number | null;
    agent: string | null;
    closingNote: string | null;
    calls: {
      id: string;
      answered: boolean;
      note: string;
      by: string;
      at: string;
    }[];
  };
  prescriptions: Prescription[];
  entries: {
    rootId: string;
    thisVisit: boolean;
    facility: string;
    latest: Version;
    earlier: Version[];
  }[];
  history: {
    id: string;
    code: string;
    createdAt: string;
    outcome: keyof typeof OUTCOME_LABEL | null;
    closingNote: string | null;
    visits: {
      id: string;
      facility: string;
      status: string;
      arrivedAt: string;
      endedAt: string | null;
    }[];
  }[];
};

const VISIT_END: Record<string, string> = {
  ARRIVED: "In care",
  DISCHARGED: "Discharged",
  COMPLETED: "Completed",
  TRANSFERRED: "Transferred",
};

/**
 * FR 7.6 to 7.11: the full record for the attending clinician during the visit, with every action that
 * can end or change it. Records from other facilities are here too (FR 7.3).
 */
export function Visit({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, reload } = useApi<View>(`/clinician/visits/${id}`);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info" title="This visit isn't open to you any more">
          It ended, or the patient was handed over or transferred. Only the attending clinician sees the record, during the visit.
        </Notice>
        <Link href="/staff/patients" className="text-small font-medium text-link underline underline-offset-2">
          Back to patients
        </Link>
      </div>
    );
  }
  if (!data) return <div className="h-96" aria-busy />;

  const leave = (message: string) => {
    toast.success(message);
    router.push("/staff/patients");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/staff/patients" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-small font-medium text-fg">
          <LuArrowLeft className="size-5" aria-hidden />
          Patients
        </Link>
        <div className="flex items-center gap-2">
          {data.case.level && <TriageBadge level={data.case.level.toLowerCase() as TriageLevel} />}
          <span className="font-mono text-small font-medium text-fg-secondary">{data.case.code}</span>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Card className="flex items-center gap-4">
            <Avatar src={data.patient.photoUrl} name={data.patient.name} size={64} />
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="text-h2 text-fg">{data.patient.name}</h1>
              <p className="text-small text-fg-secondary">
                {data.patient.sex === "FEMALE" ? "Female" : "Male"} · {data.patient.ageLabel} · born {formatDate(data.patient.dateOfBirth)}
                {data.patient.district ? ` · ${data.patient.district}` : ""}
              </p>
              <p className="text-small text-fg-secondary">
                {SERVICE_LABEL[data.service]} · arrived {formatTime(data.arrivedAt)} at {data.facility.name}
              </p>
            </div>
          </Card>
          <WhyTheyCame data={data} />
          <Record data={data} onSaved={reload} />
          <Prescriptions data={data} onIssued={reload} />
          <History data={data} />
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          <Bed data={data} onChanged={reload} onTransferred={leave} />
          <Card className="flex flex-col gap-3">
            <h2 className="text-h3 text-fg">End or hand over</h2>
            <Confirm
              trigger={
                <Button variant="primary" className="w-full">
                  {data.bed === "USED" ? "Discharge patient" : "Complete visit"}
                </Button>
              }
              title={data.bed === "USED" ? "Discharge this patient?" : "Complete this visit?"}
              description={`${data.bed === "USED" ? "Their bed is freed for the next patient. " : ""}The record can't be changed afterwards, and you can no longer open it.`}
              confirmLabel={data.bed === "USED" ? "Discharge" : "Complete visit"}
              variant="primary"
              onConfirm={async () => {
                const r = await api<{ status: string }>(`/clinician/visits/${id}/finish`, {});
                leave(r.status === "DISCHARGED" ? "Patient discharged, bed freed" : "Visit completed");
              }}
            />
            <Handover id={id} onDone={leave} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function WhyTheyCame({ data }: { data: View }) {
  const c = data.case;
  const yes = c.answers.filter((a) => a.answer);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h3 text-fg">Why they came</h2>
      {data.reason && <Notice tone="info" title={data.reason} />}
      {yes.map((a) => (
        <Notice key={a.code} tone="urgent" title={`Red flag ${a.code}: Yes`}>
          {a.text}
        </Notice>
      ))}
      {c.reason && yes.length === 0 && <p className="text-small text-fg-secondary">{c.reason}</p>}
      {c.description && (
        <div className="flex flex-col gap-1">
          <p className="text-body whitespace-pre-wrap text-fg">“{c.description}”</p>
          <p className="text-small text-fg-secondary">
            {[c.duration ? DURATION_LABEL[c.duration] : null, c.severity ? `${c.severity} out of 10` : null, c.pregnant ? "pregnant" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}
      {(c.closingNote || c.calls.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-border pt-4 text-small">
          <span className="font-medium text-fg">From the health agent{c.agent ? `, ${c.agent}` : ""}</span>
          {c.closingNote && <p className="text-fg-secondary">{c.closingNote}</p>}
          {c.calls.map((x) => (
            <p key={x.id} className="text-fg-secondary">
              Call {formatTime(x.at)}, {x.answered ? "answered" : "no answer"}: {x.note}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

/** FR 7.7: entries with author and time; an edit is a new version and the earlier ones stay readable. */
function Record({ data, onSaved }: { data: View; onSaved: () => Promise<void> }) {
  const mine = data.entries.filter((e) => e.thisVisit);
  const before = data.entries.filter((e) => !e.thisVisit);
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-h3 text-fg">Record</h2>
      {mine.length === 0 && <p className="text-small text-fg-secondary">Nothing written for this visit yet.</p>}
      {mine.map((e) => (
        <Entry key={e.rootId} visitId={data.id} entry={e} onSaved={onSaved} />
      ))}
      <EntryForm visitId={data.id} onSaved={onSaved} />
      {before.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="text-body font-semibold text-fg">From earlier visits</h3>
          {before.map((e) => (
            <Entry key={e.rootId} visitId={data.id} entry={e} onSaved={onSaved} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EntryText({ v }: { v: Version }) {
  const rows = [
    ["Diagnosis", v.diagnosis],
    ["Treatment", v.treatment],
    ["Notes", v.notes],
  ].filter(([, t]) => t);
  return (
    <dl className="grid gap-x-4 gap-y-1 text-small sm:grid-cols-[96px_1fr]">
      {rows.map(([k, t]) => (
        <div key={k} className="contents">
          <dt className="text-fg-secondary">{k}</dt>
          <dd className="whitespace-pre-wrap text-fg">{t}</dd>
        </div>
      ))}
    </dl>
  );
}

function Entry({ visitId, entry, onSaved }: { visitId: string; entry: View["entries"][number]; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const v = entry.latest;
  if (editing) return <EntryForm visitId={visitId} entry={entry} onSaved={onSaved} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-fg-muted">
          {v.by} · {formatDateTime(v.at)}
          {!entry.thisVisit ? ` · ${entry.facility}` : ""}
          {v.version > 1 ? ` · version ${v.version}` : ""}
        </span>
        {entry.thisVisit && (
          <Button variant="ghost" size="compact" icon={<LuPencil />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      <EntryText v={v} />
      {entry.earlier.length > 0 && (
        <details className="text-small">
          <summary className="cursor-pointer font-medium text-link">Earlier versions ({entry.earlier.length})</summary>
          <div className="mt-2 flex flex-col gap-3 border-l-2 border-border pl-3">
            {entry.earlier.map((e) => (
              <div key={e.id} className="flex flex-col gap-1">
                <span className="text-caption text-fg-muted">
                  Version {e.version} · {e.by} · {formatDateTime(e.at)}
                </span>
                <EntryText v={e} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function EntryForm({
  visitId,
  entry,
  onSaved,
  onDone,
}: {
  visitId: string;
  entry?: View["entries"][number];
  onSaved: () => Promise<void>;
  onDone?: () => void;
}) {
  const [diagnosis, setDiagnosis] = useState(entry?.latest.diagnosis ?? "");
  const [treatment, setTreatment] = useState(entry?.latest.treatment ?? "");
  const [notes, setNotes] = useState(entry?.latest.notes ?? "");
  const [error, setError] = useState<string>();
  const [pending, setPending] = usePending(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const body = { diagnosis, treatment, notes };
      if (entry) await api(`/clinician/visits/${visitId}/entries/${entry.rootId}`, body, { method: "PUT" });
      else await api(`/clinician/visits/${visitId}/entries`, body);
      toast.success(entry ? "New version saved" : "Entry saved");
      setError(undefined);
      if (!entry) {
        setDiagnosis("");
        setTreatment("");
        setNotes("");
      }
      onDone?.();
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiFailure ? (err.error.fields?.diagnosis ?? err.error.message) : "Couldn't save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0">
      {!entry && <h3 className="text-body font-semibold text-fg">Add an entry</h3>}
      <Textarea label="Diagnosis" optional rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} error={error} />
      <Textarea label="Treatment" optional rows={2} value={treatment} onChange={(e) => setTreatment(e.target.value)} />
      <Textarea label="Notes" optional rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" loading={pending}>
          {entry ? "Save new version" : "Save entry"}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      {entry && <p className="text-caption text-fg-muted">The current version stays in the record as an earlier version.</p>}
    </form>
  );
}

type Target = {
  facility: {
    id: string;
    name: string;
    phone: string | null;
    freeBeds: number;
  };
  km: number;
  clinician: { name: string; specialty: Service | null } | null;
} | null;

/** FR 7.8, 7.9: assign a free bed; with none free, transfer to the nearest facility that has one. */
function Bed({ data, onChanged, onTransferred }: { data: View; onChanged: () => Promise<void>; onTransferred: (m: string) => void }) {
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
                <span className="font-semibold">{target.facility.name}</span> · {formatKm(target.km)} · {target.facility.freeBeds} free beds
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
                  const r = await api<{ facility: string }>(`/clinician/visits/${data.id}/transfer`, {});
                  onTransferred(`Transferred to ${r.facility}`);
                }}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** FR 7.11: to an on-duty colleague at this facility, who is told; this clinician's access ends. */
function Handover({ id, onDone }: { id: string; onDone: (m: string) => void }) {
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
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const r = await api<{ to: string }>(`/clinician/visits/${id}/handover`, { clinicianId: to || undefined });
              onDone(`Handed over to ${r.to}`);
            } catch (err) {
              setPending(false);
              setError(err instanceof ApiFailure ? (err.error.fields?.clinicianId ?? err.error.message) : "Couldn't hand over.");
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
              options={colleagues.map((c) => ({
                value: c.id,
                label: `${c.name} · ${c.specialty ? SERVICE_LABEL[c.specialty] : "no specialty"} · ${c.activePatients} patients`,
              }))}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              error={error}
            />
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function History({ data }: { data: View }) {
  if (data.history.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-h3 text-fg">Earlier requests and visits</h2>
      <ul className="divide-y divide-border text-small">
        {data.history.map((h) => (
          <li key={h.id} className="flex flex-col gap-0.5 py-2">
            <span className="font-medium text-fg">
              {formatDate(h.createdAt)} · <span className="font-mono">{h.code}</span>
              {h.outcome ? ` · ${OUTCOME_LABEL[h.outcome]}` : ""}
            </span>
            {h.visits.map((v) => (
              <span key={v.id} className="text-fg-secondary">
                {v.facility}: {VISIT_END[v.status] ?? v.status}, {formatDate(v.arrivedAt)}
              </span>
            ))}
            {h.closingNote && <span className="text-fg-secondary">{h.closingNote}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** FR 11.1, 11.6: issue a prescription, with the patient's full prescription history above. */
function Prescriptions({ data, onIssued }: { data: View; onIssued: () => Promise<void> }) {
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-h3 text-fg">Prescriptions</h2>
      <PrescriptionHistory list={data.prescriptions} />
      <div className="border-t border-border pt-5">
        <PrescribeForm path={`/clinician/visits/${data.id}/prescriptions`} onIssued={onIssued} />
      </div>
    </Card>
  );
}
