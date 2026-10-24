"use client";

/* eslint-disable @next/next/no-img-element -- the photo is served by our API behind the session cookie */
import { DURATION_LABEL, SERVICE_LABEL, type Duration, type Service } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LuArrowLeft, LuBedDouble, LuCircleCheck } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Squircle } from "@/components/ui/squircle";
import { StatusBadge, TriageBadge, type TriageLevel } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";
import { usePending } from "@/lib/pending";

type Incoming = {
  id: string;
  caseCode: string;
  level: "URGENT" | "UNCERTAIN" | "MINOR" | null;
  service: Service;
  bedNeeded: boolean;
  bedHeld: boolean;
  redFlags: { code: string; text: string }[];
  description: string | null;
  duration: Duration | null;
  severity: number | null;
  pregnant: boolean | null;
  age: string;
  sex: "FEMALE" | "MALE";
  photoUrl: string | null;
  distanceKm: number | null;
  transferredFrom: string | null;
  sentAt: string;
  expiresAt: string | null;
  attending: { name: string; me: boolean } | null;
  issues: { id: string; note: string; by: string; at: string }[];
};

/**
 * FR 7.4, 7.5: the summary of a patient on the way, and the photo to compare with the person who arrives.
 * A match starts the visit; no match records the issue and the patient stays on the way.
 */
export function Arrival({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, reload } = useApi<Incoming>(`/clinician/incoming/${id}`);
  const [pending, setPending] = usePending(false);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info" title="This patient isn't on the way any more">
          They may have arrived, been routed elsewhere, or cancelled.
        </Notice>
        <Link href="/staff/patients" className="text-small font-medium text-link underline underline-offset-2">
          Back to patients
        </Link>
      </div>
    );
  }
  if (!data) return <div className="h-96" aria-busy />;

  async function arrive() {
    setPending(true);
    try {
      const r = await api<{ attending: boolean }>(`/clinician/incoming/${id}/arrive`, {});
      toast.success("Marked arrived");
      router.push(r.attending ? `/staff/visits/${id}` : "/staff/patients");
    } catch (e) {
      setPending(false);
      toast.error(e instanceof ApiFailure ? e.error.message : "Couldn't mark arrived.");
    }
  }

  const sex = data.sex === "FEMALE" ? "Female" : "Male";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/staff/patients" className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-small font-medium text-fg">
          <LuArrowLeft className="size-5" aria-hidden />
          Patients
        </Link>
        <div className="flex items-center gap-2">
          {data.level && <TriageBadge level={data.level.toLowerCase() as TriageLevel} />}
          <span className="font-mono text-small font-medium text-fg-secondary">{data.caseCode}</span>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* FR 7.5: the identity photo, large enough to compare a face */}
        <Card className="flex flex-col gap-4">
          <h1 className="text-h2 text-fg">
            {sex}, {data.age}
          </h1>
          {data.photoUrl ? (
            <Squircle radius="lg" className="overflow-hidden sq-bg-sunken">
              <img src={data.photoUrl} alt="Identity photo of the patient" className="aspect-[4/5] w-full object-cover object-top" />
            </Squircle>
          ) : (
            <Notice tone="warning" title="No identity photo">
              Check an ID document instead.
            </Notice>
          )}
          <p className="text-small text-fg-secondary">Photo from the national ID record. Compare it with the person in front of you.</p>
          <div className="flex flex-col gap-2">
            <Button variant="primary" loading={pending} onClick={arrive} className="w-full">
              Mark arrived
            </Button>
            <Mismatch id={id} onSaved={reload} />
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <h2 className="text-h3 text-fg">Summary</h2>
            {data.transferredFrom && <Notice tone="info" title={data.transferredFrom} />}
            {data.redFlags.map((f) => (
              <Notice key={f.code} tone="urgent" title={`Red flag ${f.code}: Yes`}>
                {f.text}
              </Notice>
            ))}
            {data.description && (
              <div className="flex flex-col gap-1">
                <p className="text-body whitespace-pre-wrap text-fg">“{data.description}”</p>
                <p className="text-small text-fg-secondary">
                  {[data.duration ? DURATION_LABEL[data.duration] : null, data.severity ? `${data.severity} out of 10` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}
            <dl className="grid gap-x-6 gap-y-3 text-small sm:grid-cols-[160px_1fr]">
              <dt className="text-fg-secondary">Needed service</dt>
              <dd className="text-fg">{SERVICE_LABEL[data.service]}</dd>
              {data.pregnant !== null && (
                <>
                  <dt className="text-fg-secondary">Pregnant</dt>
                  <dd className="text-fg">{data.pregnant ? "Yes" : "No"}</dd>
                </>
              )}
              <dt className="text-fg-secondary">Bed</dt>
              <dd className="text-fg">
                {data.bedHeld ? (
                  <StatusBadge tone="neutral" icon={<LuBedDouble aria-hidden />}>
                    One bed held
                  </StatusBadge>
                ) : data.bedNeeded ? (
                  "Needed, none could be held"
                ) : (
                  "Not needed"
                )}
              </dd>
              <dt className="text-fg-secondary">Attending clinician</dt>
              <dd className="text-fg">{data.attending ? (data.attending.me ? "You" : data.attending.name) : "None yet: whoever marks arrival"}</dd>
              <dt className="text-fg-secondary">Sent</dt>
              <dd className="text-fg">
                {formatDateTime(data.sentAt)}
                {data.expiresAt ? ` · expected until ${formatDateTime(data.expiresAt)}` : ""}
              </dd>
            </dl>
            <p className="flex items-center gap-2 text-caption text-fg-muted">
              <LuCircleCheck className="size-4" aria-hidden />
              The name and full record open for the attending clinician once the patient has arrived.
            </p>
          </Card>

          {data.issues.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="text-h3 text-fg">Photo checks that didn&apos;t match</h2>
              <ul className="flex flex-col gap-2 text-small">
                {data.issues.map((i) => (
                  <li key={i.id} className="flex flex-col">
                    <span className="font-medium text-fg">
                      {i.by} · {formatDateTime(i.at)}
                    </span>
                    <span className="text-fg-secondary">{i.note}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** FR 7.5: the person doesn't match the photo. Not marked arrived; the issue is recorded. */
function Mismatch({ id, onSaved }: { id: string; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = usePending(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full">
          Doesn&apos;t match the photo
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Record a photo mismatch"
        description="The patient stays on the way and isn't marked arrived. Say what didn't match."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="mismatch" loading={pending}>
              Record
            </Button>
          </>
        }
      >
        <form
          id="mismatch"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              await api(`/clinician/incoming/${id}/issue`, { note });
              toast.success("Mismatch recorded");
              setOpen(false);
              setNote("");
              await onSaved();
            } catch (err) {
              if (err instanceof ApiFailure) setError(err.error.fields?.note ?? err.error.message);
            } finally {
              setPending(false);
            }
          }}
        >
          <Textarea label="What didn't match" rows={3} value={note} onChange={(e) => setNote(e.target.value)} error={error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
