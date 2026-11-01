"use client";

import { useState, type FormEvent } from "react";
import { LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { usePending } from "@/lib/pending";
import { formatDateTime } from "@/lib/time";
import type { Version, View } from "./visit";

/** Entries with author and time; an edit is a new version and the earlier ones stay readable. */
export function ClinicalRecord({ data, onSaved }: { data: View; onSaved: () => Promise<void> }) {
  const mine = data.entries.filter((entry) => entry.thisVisit);
  const before = data.entries.filter((entry) => !entry.thisVisit);
  return (
    <Card className="flex flex-col gap-5">
      <h2 className="text-h3 text-fg">Record</h2>
      {mine.length === 0 && <p className="text-small text-fg-secondary">Nothing written for this visit yet.</p>}
      {mine.map((note) => (
        <Entry key={note.rootId} visitId={data.id} entry={note} onSaved={onSaved} />
      ))}
      <EntryForm visitId={data.id} onSaved={onSaved} />
      {before.length > 0 && (
        <div className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="text-body font-semibold text-fg">From earlier visits</h3>
          {before.map((note) => (
            <Entry key={note.rootId} visitId={data.id} entry={note} onSaved={onSaved} />
          ))}
        </div>
      )}
    </Card>
  );
}

export function EntryText({ v }: { v: Version }) {
  const rows = [
    ["Diagnosis", v.diagnosis],
    ["Treatment", v.treatment],
    ["Notes", v.notes],
  ].filter(([, t]) => t);
  return (
    <dl className="grid gap-x-4 gap-y-1 text-small sm:grid-cols-[96px_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-secondary">{label}</dt>
          <dd className="whitespace-pre-wrap text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Entry({
  visitId,
  entry,
  onSaved,
}: {
  visitId: string;
  entry: View["entries"][number];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const latest = entry.latest;
  if (editing) return <EntryForm visitId={visitId} entry={entry} onSaved={onSaved} onDone={() => setEditing(false)} />;
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-fg-muted">
          {latest.by} · {formatDateTime(latest.at)}
          {!entry.thisVisit ? ` · ${entry.facility}` : ""}
          {latest.version > 1 ? ` · version ${latest.version}` : ""}
        </span>
        {entry.thisVisit && (
          <Button variant="ghost" size="compact" icon={<LuPencil />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      <EntryText v={latest} />
      {entry.earlier.length > 0 && (
        <details className="text-small">
          <summary className="cursor-pointer font-medium text-link">Earlier versions ({entry.earlier.length})</summary>
          <div className="mt-2 flex flex-col gap-3 border-l-2 border-border pl-3">
            {entry.earlier.map((older) => (
              <div key={older.id} className="flex flex-col gap-1">
                <span className="text-caption text-fg-muted">
                  Version {older.version} · {older.by} · {formatDateTime(older.at)}
                </span>
                <EntryText v={older} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function EntryForm({
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
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0"
    >
      {!entry && <h3 className="text-body font-semibold text-fg">Add an entry</h3>}
      <Textarea
        label="Diagnosis"
        optional
        rows={2}
        value={diagnosis}
        onChange={(event) => setDiagnosis(event.target.value)}
        error={error}
      />
      <Textarea
        label="Treatment"
        optional
        rows={2}
        value={treatment}
        onChange={(event) => setTreatment(event.target.value)}
      />
      <Textarea label="Notes" optional rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
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
      {entry && (
        <p className="text-caption text-fg-muted">The current version stays in the record as an earlier version.</p>
      )}
    </form>
  );
}
