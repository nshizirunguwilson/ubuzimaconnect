"use client";

import { useState } from "react";
import { LuPill } from "react-icons/lu";
import { PageHeader } from "@/components/app/page-header";
import { PrescriptionCard, type Prescription } from "@/components/app/prescription";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { usePending } from "@/lib/pending";
import { useApi } from "@/lib/use-api";

/** FR 11.5, 11.3: every prescription I issued, at any time, and cancelling my own valid ones. */
export function MyPrescriptions() {
  const { data, reload } = useApi<Prescription[]>("/prescriptions/mine");
  if (!data) return <div className="h-96" aria-busy />;
  const valid = data.filter((p) => p.status === "VALID").length;
  return (
    <div className="flex max-w-[800px] flex-col gap-6">
      <PageHeader
        title="My prescriptions"
        intro={data.length ? `${data.length} issued by you, ${valid} still valid. Only you can cancel the ones you issued.` : "Prescriptions you issue appear here."}
      />
      {data.length === 0 ? (
        <Card className="p-0 md:p-0">
          <EmptyState icon={LuPill} message="You haven't issued any prescriptions yet." />
        </Card>
      ) : (
        data.map((p) => <PrescriptionCard key={p.id} p={p} action={p.status === "VALID" && <Cancel p={p} onDone={reload} />} />)
      )}
    </div>
  );
}

/** FR 11.3: with a reason; the check page then shows "Do not dispense". */
function Cancel({ p, onDone }: { p: Prescription; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = usePending(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="compact" className="self-start">
          Cancel prescription
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Cancel ${p.code}?`}
        description={`Pharmacies checking it will see "Do not dispense". The patient keeps it in their records, marked Cancelled. This can't be undone.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" type="submit" form={`cancel-${p.id}`} loading={pending}>
              Cancel prescription
            </Button>
          </>
        }
      >
        <form
          id={`cancel-${p.id}`}
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              await api(`/prescriptions/${p.id}/cancel`, { reason });
              toast.success(`${p.code} cancelled`);
              setOpen(false);
              await onDone();
            } catch (err) {
              setError(err instanceof ApiFailure ? (err.error.fields?.reason ?? err.error.message) : "Couldn't cancel.");
            } finally {
              setPending(false);
            }
          }}
        >
          <Textarea label="Why it is cancelled" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={error} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
