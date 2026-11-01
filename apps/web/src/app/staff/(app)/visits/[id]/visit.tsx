"use client";

import { DURATION_LABEL, OUTCOME_LABEL, SERVICE_LABEL, type Duration, type Service } from "@ubuzima/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PiArrowLeftBold } from "react-icons/pi";
import { Avatar } from "@/components/app/avatar";
import { PrescribeForm, PrescriptionHistory, type Prescription } from "@/components/app/prescription";
import { Confirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tab, Tabs, TabsContent, TabsList } from "@/components/ui/tabs";

import { Notice } from "@/components/ui/notice";
import { TriageBadge, type TriageLevel } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";

import { formatDate, formatTime } from "@/lib/time";
import { useApi } from "@/lib/use-api";
import { Bed, Handover } from "./bed-and-handover";
import { ClinicalRecord } from "./record";

type Level = "URGENT" | "UNCERTAIN" | "MINOR";
export type Version = {
  id: string;
  version: number;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  by: string;
  at: string;
};
export type View = {
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
 * The full record for the attending clinician during the visit, with every action that
 * can end or change it. Records from other facilities are here too.
 */
export function Visit({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, reload } = useApi<View>(`/clinician/visits/${id}`);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="info" title="This visit isn't open to you any more">
          It ended, or the patient was handed over or transferred. Only the attending clinician sees the record, during
          the visit.
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
        <Link
          href="/staff/patients"
          className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-small font-medium text-fg"
        >
          <PiArrowLeftBold className="size-5" aria-hidden />
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
                {data.patient.sex === "FEMALE" ? "Female" : "Male"} · {data.patient.ageLabel} · born{" "}
                {formatDate(data.patient.dateOfBirth)}
                {data.patient.district ? ` · ${data.patient.district}` : ""}
              </p>
              <p className="text-small text-fg-secondary">
                {SERVICE_LABEL[data.service]} · arrived {formatTime(data.arrivedAt)} at {data.facility.name}
              </p>
            </div>
          </Card>
          {/* One part of the visit at a time; forceMount keeps half-written entries when switching. */}
          <Tabs defaultValue="why" className="flex flex-col gap-6">
            <TabsList aria-label="Visit sections">
              <Tab value="why">Why they came</Tab>
              <Tab value="record" count={data.entries.length}>
                Record
              </Tab>
              <Tab value="prescribe" count={data.prescriptions.length}>
                Prescribe
              </Tab>
              <Tab value="history" count={data.history.length}>
                History
              </Tab>
            </TabsList>
            <TabsContent value="why" forceMount className="data-[state=inactive]:hidden">
              <WhyTheyCame data={data} />
            </TabsContent>
            <TabsContent value="record" forceMount className="data-[state=inactive]:hidden">
              <ClinicalRecord data={data} onSaved={reload} />
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
                const result = await api<{ status: string }>(`/clinician/visits/${id}/finish`, {});
                leave(result.status === "DISCHARGED" ? "Patient discharged, bed freed" : "Visit completed");
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
  const found = data.case;
  const yes = found.answers.filter((reply) => reply.answer);
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h3 text-fg">Why they came</h2>
      {data.reason && <Notice tone="info" title={data.reason} />}
      {yes.map((sign) => (
        <Notice key={sign.code} tone="urgent" title={`Red flag ${sign.code}: Yes`}>
          {sign.text}
        </Notice>
      ))}
      {found.reason && yes.length === 0 && <p className="text-small text-fg-secondary">{found.reason}</p>}
      {found.description && (
        <div className="flex flex-col gap-1">
          <p className="text-body whitespace-pre-wrap text-fg">“{found.description}”</p>
          <p className="text-small text-fg-secondary">
            {[
              found.duration ? DURATION_LABEL[found.duration] : null,
              found.severity ? `${found.severity} out of 10` : null,
              found.pregnant ? "pregnant" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      )}
      {(found.closingNote || found.calls.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-border pt-4 text-small">
          <span className="font-medium text-fg">From the health agent{found.agent ? `, ${found.agent}` : ""}</span>
          {found.closingNote && <p className="text-fg-secondary">{found.closingNote}</p>}
          {found.calls.map((call) => (
            <p key={call.id} className="text-fg-secondary">
              Call {formatTime(call.at)}, {call.answered ? "answered" : "no answer"}: {call.note}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function History({ data }: { data: View }) {
  if (data.history.length === 0)
    return <Card className="text-small text-fg-secondary">No earlier requests or visits.</Card>;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-h3 text-fg">Earlier requests and visits</h2>
      <ul className="divide-y divide-border text-small">
        {data.history.map((earlier) => (
          <li key={earlier.id} className="flex flex-col gap-0.5 py-2">
            <span className="font-medium text-fg">
              {formatDate(earlier.createdAt)} · <span className="font-mono">{earlier.code}</span>
              {earlier.outcome ? ` · ${OUTCOME_LABEL[earlier.outcome]}` : ""}
            </span>
            {earlier.visits.map((visit) => (
              <span key={visit.id} className="text-fg-secondary">
                {visit.facility}: {VISIT_END[visit.status] ?? visit.status}, {formatDate(visit.arrivedAt)}
              </span>
            ))}
            {earlier.closingNote && <span className="text-fg-secondary">{earlier.closingNote}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Issue a prescription, with the patient's full prescription history above. */
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
