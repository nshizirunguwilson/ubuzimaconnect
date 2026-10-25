"use client";

import {
  CATEGORIES,
  CATEGORY_LABEL,
  DURATION_LABEL,
  OUTCOME_LABEL,
  OUTCOMES,
  PHONE_OWNER_LABEL,
  SERVICE_LABEL,
  SERVICES,
  formatKm,
  type Category,
  type Duration,
  type Service,
} from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LuArrowLeft, LuCircleCheck, LuCircleHelp, LuPhone, LuSparkles, LuTriangleAlert } from "react-icons/lu";
import { Avatar } from "@/components/app/avatar";
import { PrescribeForm, PrescriptionHistory, type Prescription } from "@/components/app/prescription";
import { Chat, type ChatMsg } from "@/components/app/chat";
import { Confirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tab, Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Checkbox, ChoiceRow } from "@/components/ui/choice";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { TriageBadge, type TriageLevel } from "@/components/ui/status";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { useLive } from "@/lib/live";
import { formatDate, formatDateTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";

type Level = "URGENT" | "UNCERTAIN" | "MINOR";
type Routing = {
  id: string;
  status: string;
  facility: { id: string; name: string; phone: string | null };
  service: Service;
  bedNeeded: boolean;
  bedHeld: boolean;
  clinician: { id: string; name: string; specialty: Service | null } | null;
  distanceKm: number | null;
  expiresAt: string | null;
};
type View = {
  id: string;
  code: string;
  status: string;
  patient: { id: string; name: string; sex: "FEMALE" | "MALE"; age: { years: number; months: number; days: number }; dateOfBirth: string; district: string | null; photoUrl: string | null; openedBy: string | null };
  triage: { level: Level | null; reason: string | null; category: Category | null; neededService: Service | null; bedNeeded: boolean | null };
  pregnant: boolean | null;
  answers: { code: string; text: string; answer: boolean }[];
  description: string | null;
  duration: Duration | null;
  severity: number | null;
  ai: { category: Category | null; urgency: "URGENT" | "MINOR" | null; confidence: "LOW" | "MEDIUM" | "HIGH" | null; reason: string | null; error: string | null } | null;
  call: { number: string; owner: keyof typeof PHONE_OWNER_LABEL } | null;
  calls: { id: string; answered: boolean; note: string; by: string; at: string }[];
  messages: ChatMsg[];
  changes: { field: string; fromValue: string | null; toValue: string | null; createdAt: string }[];
  prescriptions: Prescription[];
  routings: Routing[];
  history: { id: string; code: string; createdAt: string; triageLevel: Level | null; category: Category | null; outcome: string | null; closingNote: string | null }[];
};

const lvl = (l: Level) => l.toLowerCase() as TriageLevel;
const ageText = (a: View["patient"]["age"]) => (a.years >= 1 ? `${a.years} years` : a.months >= 1 ? `${a.months} months` : `${a.days} days`);

/** FR 6.5 to 6.16 and 5.6 to 5.12: everything the agent needs for one case, on one screen. */
export function Workspace({ id }: { id: string }) {
  const router = useRouter();
  const { data, reload, error } = useApi<View>(`/agent/cases/${id}`);

  useLive(
    `/events/cases/${id}`,
    (e) => {
      if (e.type === "message") void reload();
      if (e.type === "case") void reload().catch(() => null);
    },
    () => void reload(),
  );

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info" title="This case is no longer with you">
          It was closed, given back, or the patient cancelled it.
        </Notice>
        <Link href="/staff/queue" className="text-small font-medium text-link underline underline-offset-2">
          Back to the queue
        </Link>
      </div>
    );
  }
  if (!data) return <div className="h-96" aria-busy />;

  const active = data.routings.find((r) => r.status === "SUGGESTED" || r.status === "CONFIRMED") ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/staff/queue" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-small font-medium text-fg">
          <LuArrowLeft className="size-5" aria-hidden />
          Queue
        </Link>
        <div className="flex items-center gap-2">
          {data.triage.level && <TriageBadge level={lvl(data.triage.level)} />}
          <span className="font-mono text-small font-medium text-fg-secondary">{data.code}</span>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6">
          <PatientCard data={data} />
          {/* One part of the work at a time (D72); forceMount keeps half-filled forms when switching. */}
          <Tabs defaultValue="case" className="flex flex-col gap-6">
            <TabsList aria-label="Case sections">
              <Tab value="case">Case</Tab>
              <Tab value="routing">Routing</Tab>
              <Tab value="prescribe" count={data.prescriptions.length}>
                Prescribe
              </Tab>
              <Tab value="history" count={data.history.length}>
                History
              </Tab>
            </TabsList>
            <TabsContent value="case" forceMount className="flex flex-col gap-6 data-[state=inactive]:hidden">
              <WhatTheySaid data={data} />
              <Review data={data} onSaved={reload} />
            </TabsContent>
            <TabsContent value="routing" forceMount className="data-[state=inactive]:hidden">
              <RoutingPanel data={data} active={active} onDone={reload} />
            </TabsContent>
            <TabsContent value="prescribe" forceMount className="data-[state=inactive]:hidden">
              <Prescriptions data={data} onIssued={reload} />
            </TabsContent>
            <TabsContent value="history" forceMount className="data-[state=inactive]:hidden">
              <History data={data} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          <Card className="flex h-[520px] flex-col gap-3">
            <h2 className="text-h3 text-fg">Chat</h2>
            <Chat
              me="AGENT"
              sendVariant="secondary"
              messages={data.messages}
              className="flex-1"
              onSend={async (text) => {
                await api(`/agent/cases/${id}/messages`, { text });
                await reload();
              }}
            />
          </Card>
          {data.call && <Calls data={data} onDone={reload} />}
          <Actions data={data} hasConfirmedRouting={active?.status === "CONFIRMED"} onClosed={() => router.push("/staff/queue")} onOpen={(next) => router.push(`/staff/cases/${next}`)} />
        </div>
      </div>
    </div>
  );
}

function PatientCard({ data }: { data: View }) {
  const p = data.patient;
  return (
    <Card className="flex items-center gap-4">
      {/* FR 1.10: the photo from the identity record */}
      <Avatar src={p.photoUrl} name={p.name} size={64} />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-h2 text-fg">{p.name}</h1>
        <p className="text-small text-fg-secondary">
          {p.sex === "FEMALE" ? "Female" : "Male"} · {ageText(p.age)} · born {formatDate(p.dateOfBirth)}
          {p.district ? ` · ${p.district}` : ""}
        </p>
        {p.openedBy && <p className="text-small text-fg-secondary">Request made by their parent, {p.openedBy}</p>}
      </div>
    </Card>
  );
}

function WhatTheySaid({ data }: { data: View }) {
  const yes = data.answers.filter((a) => a.answer);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h3 text-fg">What the patient told us</h2>
      {yes.length > 0 ? (
        yes.map((a) => (
          <Notice key={a.code} tone="urgent" title={`Red flag ${a.code}: Yes`}>
            {a.text}
          </Notice>
        ))
      ) : data.answers.length > 0 ? (
        <p className="flex items-center gap-2 text-small text-fg-secondary">
          <LuCircleCheck className="size-4 text-success" aria-hidden />
          No to all {data.answers.length} red-flag questions{data.pregnant ? " (pregnant)" : ""}.
        </p>
      ) : null}
      {/* The red-flag notice already says why; otherwise show the triage reason. */}
      {data.triage.reason && yes.length === 0 && <p className="text-small text-fg-secondary">{data.triage.reason}</p>}
      {data.description && (
        <div className="flex flex-col gap-1">
          <p className="text-body whitespace-pre-wrap text-fg">“{data.description}”</p>
          <p className="text-small text-fg-secondary">
            {data.duration ? DURATION_LABEL[data.duration] : ""}
            {data.severity ? ` · ${data.severity} out of 10` : ""}
          </p>
        </div>
      )}
      {/* DESIGN.md §10: never a score; the suggestion is labelled as one */}
      {data.ai && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="flex items-center gap-2 text-caption font-medium text-fg-muted">
            <LuSparkles className="size-4" aria-hidden />
            Suggested by AI · reviewed by you
          </p>
          {data.ai.error ? (
            <p className="text-small text-fg-secondary">The AI wasn&apos;t available for this case.</p>
          ) : (
            <>
              <p className="text-body text-fg">
                {data.ai.category ? CATEGORY_LABEL[data.ai.category] : "No category"} · {data.ai.urgency === "URGENT" ? "seems urgent" : "seems minor"} ·{" "}
                {data.ai.confidence?.toLowerCase()} confidence
              </p>
              {data.ai.reason && <p className="text-small text-fg-secondary">{data.ai.reason}</p>}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/** FR 6.5: confirm or change the level, category, needed service and bed. */
function Review({ data, onSaved }: { data: View; onSaved: () => Promise<void> }) {
  const [level, setLevel] = useState<Level>(data.triage.level ?? "UNCERTAIN");
  const [category, setCategory] = useState<string>(data.triage.category ?? "");
  const [service, setService] = useState<Service>(data.triage.neededService ?? "GENERAL_MEDICINE");
  const [bed, setBed] = useState(data.triage.bedNeeded ?? false);
  const [pending, setPending] = useState(false);
  const levels = [
    { v: "URGENT", label: "Urgent", hint: "Needs care at a facility today.", icon: <LuTriangleAlert className="text-urgent" /> },
    { v: "UNCERTAIN", label: "Uncertain", hint: "Can't be judged safely yet.", icon: <LuCircleHelp className="text-warning-fg" /> },
    { v: "MINOR", label: "Minor", hint: "Can be handled remotely.", icon: <LuCircleCheck className="text-success" /> },
  ] as const;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const r = await api<{ changed: number }>(`/agent/cases/${data.id}/triage`, { triageLevel: level, category: category || null, neededService: service, bedNeeded: bed }, { method: "PUT" });
      toast.success(r.changed ? "Triage saved" : "Triage confirmed");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof ApiFailure ? err.error.message : "Couldn't save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-h3 text-fg">Review the triage</h2>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-small font-medium text-fg">Level</legend>
          {levels.map((l) => (
            <ChoiceRow key={l.v} name="level" value={l.v} label={l.label} description={l.hint} icon={l.icon} checked={level === l.v} onChange={() => setLevel(l.v)} />
          ))}
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Category" placeholder="No category" optional options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} value={category} onChange={(e) => setCategory(e.target.value)} />
          <Select label="Needed service" options={SERVICES.map((s) => ({ value: s, label: SERVICE_LABEL[s] }))} value={service} onChange={(e) => setService(e.target.value as Service)} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-body font-medium text-fg">Bed needed</span>
            <span className="text-small text-fg-secondary">A bed is held as soon as a facility is given.</span>
          </div>
          <Switch label="Bed needed" checked={bed} onChange={setBed} />
        </div>
        <Button type="submit" variant="secondary" loading={pending} className="self-start">
          Save triage
        </Button>
      </form>
      {data.changes.length > 0 && (
        <p className="text-caption text-fg-muted">
          {data.changes.length} {data.changes.length === 1 ? "change" : "changes"} saved, the last at {formatDateTime(data.changes[data.changes.length - 1].createdAt)}.
        </p>
      )}
    </Card>
  );
}

type Options = {
  kind: "SUITABLE" | "NO_BEDS" | "NO_MATCH";
  nearestId: string | null;
  service: Service;
  facilities: {
    id: string;
    name: string;
    km: number | null;
    freeBeds: number;
    specialtyOnDuty: boolean;
    suitable: boolean;
    clinicians: { id: string; name: string; specialty: Service | null; activePatients: number }[];
  }[];
};

/** FR 5.3 to 5.12: choose the facility and the attending clinician, with reasons when not the default. */
function RoutingPanel({ data, active, onDone }: { data: View; active: Routing | null; onDone: () => Promise<void> }) {
  const service = data.triage.neededService ?? "GENERAL_MEDICINE";
  const bed = data.triage.bedNeeded ?? false;
  const { data: opts } = useApi<Options>(`/agent/cases/${data.id}/routing-options?service=${service}&bedNeeded=${bed}&v=${active?.id ?? ""}`);
  const [facilityId, setFacilityId] = useState<string>("");
  const [clinicianId, setClinicianId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [clinicianReason, setClinicianReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const chosenId = facilityId || active?.facility.id || opts?.nearestId || "";
  const chosen = opts?.facilities.find((f) => f.id === chosenId);
  const clinician = chosen?.clinicians.find((c) => c.id === clinicianId) ?? chosen?.clinicians.find((c) => c.specialty === service);
  const needsReason = !!opts?.nearestId && chosenId !== opts.nearestId;
  const needsClinicianReason = !!clinician && clinician.specialty !== service;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosenId) return;
    setPending(true);
    try {
      await api(`/agent/cases/${data.id}/routing`, {
        facilityId: chosenId,
        bedNeeded: bed,
        reason: needsReason ? reason || undefined : undefined,
        clinicianId: clinician?.id,
        clinicianReason: needsClinicianReason ? clinicianReason || undefined : undefined,
      });
      setErrors({});
      toast.success("Routing confirmed: the patient has been told where to go");
      await onDone();
    } catch (err) {
      if (err instanceof ApiFailure) setErrors(err.error.fields ?? { form: err.error.message });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 text-fg">Routing</h2>
        <span className="text-small text-fg-secondary">
          {SERVICE_LABEL[service]} · {bed ? "Bed needed: Yes" : "Bed needed: No"}
        </span>
      </div>
      {active && (
        <Notice tone={active.status === "CONFIRMED" ? "success" : "info"} title={`${active.status === "CONFIRMED" ? "Confirmed" : "Suggested"}: ${active.facility.name}`}>
          {active.clinician ? `Attending: ${active.clinician.name}. ` : "No clinician of this specialty on duty. "}
          {active.bedNeeded ? (active.bedHeld ? "A bed is held. " : "No bed could be held. ") : ""}
          {active.expiresAt ? `Valid until ${formatDateTime(active.expiresAt)}.` : "Confirm it so the facility expects the patient."}
        </Notice>
      )}
      {!opts ? (
        <div className="h-24" aria-busy />
      ) : opts.kind === "NO_MATCH" ? (
        <Notice tone="urgent" title="No facility offers this service with a clinician on duty">
          Tell the patient to call 912. Try another service if it fits.
        </Notice>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {opts.kind === "NO_BEDS" && <Notice tone="warning" title="No beds currently available" />}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-small font-medium text-fg">Facility, nearest first</legend>
            {opts.facilities.slice(0, 5).map((f) => (
              <ChoiceRow
                key={f.id}
                name="facility"
                value={f.id}
                checked={chosenId === f.id}
                onChange={() => {
                  setFacilityId(f.id);
                  setClinicianId("");
                }}
                disabled={!f.specialtyOnDuty}
                label={f.name}
                description={[
                  f.km === null ? null : formatKm(f.km),
                  f.specialtyOnDuty ? "specialty on duty" : "no specialty on duty",
                  `${f.freeBeds} free beds`,
                  f.id === opts.nearestId ? "nearest suitable" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </fieldset>
          {needsReason && <Input label="Reason for not choosing the nearest" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />}
          {chosen && chosen.clinicians.length > 0 && (
            <Select
              label="Attending clinician"
              hint="Suggested: the on-duty clinician of this specialty with the fewest patients"
              options={chosen.clinicians.map((c) => ({ value: c.id, label: `${c.name} · ${c.specialty ? SERVICE_LABEL[c.specialty] : "no specialty"} · ${c.activePatients} patients` }))}
              value={clinician?.id ?? ""}
              onChange={(e) => setClinicianId(e.target.value)}
            />
          )}
          {needsClinicianReason && <Input label="Reason for a clinician of another specialty" value={clinicianReason} onChange={(e) => setClinicianReason(e.target.value)} error={errors.clinicianReason} />}
          {errors.form && <p className="text-small font-medium text-urgent-fg">{errors.form}</p>}
          <Button type="submit" variant="secondary" loading={pending} className="self-start">
            {active?.status === "CONFIRMED" && active.facility.id !== chosenId ? "Change routing" : "Confirm routing"}
          </Button>
        </form>
      )}
    </Card>
  );
}

/** FR 6.7: call attempts with notes; the date of birth first when the number isn't the patient's. */
function Calls({ data, onDone }: { data: View; onDone: () => Promise<void> }) {
  const [answered, setAnswered] = useState(true);
  const [dob, setDob] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const notOwn = data.call!.owner !== "MINE";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const r = await api<{ closed: boolean }>(`/agent/cases/${data.id}/calls`, { answered, dobConfirmed: dob, note });
      setNote("");
      setError(undefined);
      toast.success(r.closed ? "Closed as No response after 3 unanswered calls" : "Call saved");
      await onDone();
    } catch (err) {
      if (err instanceof ApiFailure) setError(err.error.fields?.note ?? err.error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 text-fg">Call requested</h2>
        <a href={`tel:${data.call!.number}`} className="inline-flex items-center gap-2 font-mono text-body font-medium text-link">
          <LuPhone className="size-4" aria-hidden />
          {data.call!.number}
        </a>
      </div>
      <p className="text-small text-fg-secondary">{PHONE_OWNER_LABEL[data.call!.owner]} number.</p>
      {notOwn && (
        <Notice tone="warning" title="Not the patient's own number">
          Confirm their date of birth ({formatDate(data.patient.dateOfBirth)}) before discussing anything medical.
        </Notice>
      )}
      {data.calls.length > 0 && (
        <ul className="flex flex-col gap-2 text-small">
          {data.calls.map((c) => (
            <li key={c.id} className="flex flex-col">
              <span className="font-medium text-fg">
                {c.answered ? "Answered" : "No answer"} · {formatDateTime(c.at)}
              </span>
              <span className="text-fg-secondary">{c.note}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex gap-2">
          <Button variant={answered ? "secondary" : "ghost"} size="compact" onClick={() => setAnswered(true)} aria-pressed={answered}>
            Answered
          </Button>
          <Button variant={!answered ? "secondary" : "ghost"} size="compact" onClick={() => setAnswered(false)} aria-pressed={!answered}>
            No answer
          </Button>
        </div>
        {answered && notOwn && <Checkbox label="I confirmed the date of birth" checked={dob} onChange={(e) => setDob(e.target.checked)} />}
        <Textarea label="Call note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={error} />
        <Button type="submit" variant="secondary" loading={pending} className="self-start">
          Save call
        </Button>
      </form>
    </Card>
  );
}

/** FR 6.15, 6.16, 6.12: close (the one primary action), release, or pause for an urgent case. */
function Actions({
  data,
  hasConfirmedRouting,
  onClosed,
  onOpen,
}: {
  data: View;
  hasConfirmedRouting: boolean;
  onClosed: () => void;
  onOpen: (caseId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>(hasConfirmedRouting ? "ROUTED_TO_FACILITY" : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="primary" className="w-full">
            Close case
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Close this case"
          description="You won't be able to open the patient's records after closing. The patient is asked to rate the help."
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="close-case" loading={pending}>
                Close case
              </Button>
            </>
          }
        >
          <form
            id="close-case"
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              try {
                await api(`/agent/cases/${data.id}/close`, { outcome: outcome || undefined, note });
                toast.success("Case closed");
                onClosed();
              } catch (err) {
                if (err instanceof ApiFailure) setErrors(err.error.fields ?? { form: err.error.message });
              } finally {
                setPending(false);
              }
            }}
          >
            <Select label="Outcome" placeholder="Choose the outcome" options={OUTCOMES.map((o) => ({ value: o, label: OUTCOME_LABEL[o] }))} value={outcome} onChange={(e) => setOutcome(e.target.value)} error={errors.outcome} />
            <Textarea label="Closing note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
            {errors.form && <p className="text-small font-medium text-urgent-fg">{errors.form}</p>}
          </form>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap gap-2">
        <Confirm
          trigger={
            <Button variant="ghost" size="compact">
              Give back to the queue
            </Button>
          }
          title="Give this case back?"
          description="It goes to the front of its queue level for the next agent. The patient is told another agent will continue."
          confirmLabel="Give back"
          onConfirm={async () => {
            await api(`/agent/cases/${data.id}/release`, {});
            onClosed();
          }}
        />
        {data.triage.level !== "URGENT" && (
          <Button
            variant="ghost"
            size="compact"
            onClick={async () => {
              try {
                const r = await api<{ next: string }>(`/agent/cases/${data.id}/pause`, {});
                onOpen(r.next);
              } catch (err) {
                toast.error(err instanceof ApiFailure ? err.error.message : "Couldn't pause.");
              }
            }}
          >
            Pause for an urgent case
          </Button>
        )}
      </div>
    </Card>
  );
}

function History({ data }: { data: View }) {
  if (data.history.length === 0) return <Card className="text-small text-fg-secondary">No earlier requests.</Card>;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-h3 text-fg">Earlier requests</h2>
      <ul className="divide-y divide-border text-small">
        {data.history.map((h) => (
          <li key={h.id} className="flex flex-col gap-0.5 py-2">
            <span className="font-medium text-fg">
              {formatDate(h.createdAt)} · {h.category ? CATEGORY_LABEL[h.category] : "No category"}
              {h.outcome ? ` · ${OUTCOME_LABEL[h.outcome as keyof typeof OUTCOME_LABEL] ?? h.outcome}` : ""}
            </span>
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
        <PrescribeForm path={`/agent/cases/${data.id}/prescriptions`} onIssued={onIssued} />
      </div>
    </Card>
  );
}
