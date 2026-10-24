"use client";

import { RED_FLAG_GROUP_LABEL, redFlagQuestion, SERVICE_LABEL, SERVICES, type Service } from "@ubuzima/shared";
import { useState, type FormEvent } from "react";
import { LuPlus } from "react-icons/lu";
import { Confirm } from "@/components/app/confirm";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Squircle } from "@/components/ui/squircle";
import { StatusBadge } from "@/components/ui/status";
import { toast } from "@/components/ui/toast";
import { api, ApiFailure } from "@/lib/api";
import { check } from "@/lib/form";
import { useApi } from "@/lib/use-api";

type Group = keyof typeof RED_FLAG_GROUP_LABEL;
type Q = { id: string; code: string; group: Group; textEn: string; textRw: string | null; service: Service; source: string | null };

/** When each group is asked (SRS Appendix C). */
const WHEN: Record<Group, string> = {
  A: "Always asked.",
  C: "Asked when the sick person is under 12.",
  N: "Asked when the baby is under 2 months. Babies under 8 days are Urgent without questions.",
  P: "Asked when she is aged 12 to 55 and answers Yes to “Are you pregnant?”.",
};

/**
 * FR 12.6 and Appendix C: only the administrator changes the list, in Kinyarwanda and English.
 * Changes apply to new cases only, and every change is logged.
 */
export function RedFlags() {
  const { data, reload } = useApi<Q[]>("/red-flags");
  const missingRw = data?.filter((q) => !q.textRw).length ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Red-flag list"
        intro="Danger-sign questions asked before a patient describes the problem. A Yes makes the case Urgent at once and sets the service needed. Changes apply to new cases only."
        action={<QuestionDialog onDone={reload} />}
      />
      {missingRw > 0 && (
        <p className="text-small text-fg-secondary">
          <StatusBadge tone="warning" className="mr-2">
            {missingRw} without Kinyarwanda
          </StatusBadge>
          Patients who choose Kinyarwanda see the English text for these until a translation is added.
        </p>
      )}
      {data === null ? (
        <div className="h-96" aria-busy />
      ) : (
        (Object.keys(RED_FLAG_GROUP_LABEL) as Group[]).map((g) => {
          const qs = data.filter((q) => q.group === g);
          return (
            <section key={g} className="flex flex-col gap-3" aria-labelledby={`group-${g}`}>
              <div className="flex flex-col gap-1">
                <h2 id={`group-${g}`} className="text-h2 text-fg">
                  {RED_FLAG_GROUP_LABEL[g]}
                </h2>
                <p className="text-small text-fg-secondary">{WHEN[g]}</p>
              </div>
              <Card className="p-0 md:p-0">
                <ul className="divide-y divide-border">
                  {qs.map((q) => (
                    <li key={q.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 md:px-6">
                      <Squircle as="span" radius="sm" className="mt-0.5 inline-flex h-7 min-w-10 items-center justify-center px-2 font-mono text-small font-medium sq-bg-sunken text-fg">
                        {q.code}
                      </Squircle>
                      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
                        <p className="text-body text-fg">{q.textEn}</p>
                        <p className="text-small text-fg-secondary">
                          Needs {SERVICE_LABEL[q.service]}
                          {/* Per row only once some have it; when none do, the summary above says so once. */}
                          {!q.textRw && missingRw < data.length ? " · No Kinyarwanda yet" : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <QuestionDialog question={q} onDone={reload} />
                        <Confirm
                          trigger={
                            <Button variant="ghost" size="compact">
                              Remove
                            </Button>
                          }
                          title={`Remove ${q.code}?`}
                          description="New cases won't ask this question. Cases that already answered it still show it."
                          confirmLabel="Remove question"
                          onConfirm={async () => {
                            await api(`/red-flags/${q.id}`, undefined, { method: "DELETE" });
                            toast.success(`${q.code} removed`);
                            await reload();
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          );
        })
      )}
    </div>
  );
}

function QuestionDialog({ question, onDone }: { question?: Q; onDone: () => Promise<void> }) {
  const start = question
    ? { group: question.group as string, textEn: question.textEn, textRw: question.textRw ?? "", service: question.service as string, source: question.source ?? "" }
    : { group: "", textEn: "", textRw: "", service: "", source: "" };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const id = `q-${question?.id ?? "new"}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(redFlagQuestion, {
      ...form,
      group: form.group || undefined,
      service: form.service || undefined,
      textRw: form.textRw || undefined,
      source: form.source || undefined,
    });
    if (!r.data) return setErrors(r.errors);
    setErrors({});
    setPending(true);
    try {
      if (question) await api(`/red-flags/${question.id}`, r.data, { method: "PUT" });
      else await api("/red-flags", r.data);
      toast.success(question ? `${question.code} saved` : "Question added");
      setOpen(false);
      await onDone();
    } catch (err) {
      if (err instanceof ApiFailure) setErrors(err.error.fields ?? { textEn: err.error.message });
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
        {question ? (
          <Button variant="ghost" size="compact">
            Edit
          </Button>
        ) : (
          <Button variant="primary" icon={<LuPlus />}>
            Add question
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={question ? `Edit ${question.code}` : "Add question"}
        description="Write it so a family member can answer by looking at the sick person."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={id} loading={pending}>
              {question ? "Save question" : "Add question"}
            </Button>
          </>
        }
      >
        <form id={id} onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Select
            label="Who is asked"
            placeholder="Choose a group"
            options={(Object.keys(RED_FLAG_GROUP_LABEL) as Group[]).map((g) => ({ value: g, label: RED_FLAG_GROUP_LABEL[g] }))}
            value={form.group}
            onChange={set("group")}
            error={errors.group}
          />
          <Textarea label="Question in English" rows={3} value={form.textEn} onChange={set("textEn")} error={errors.textEn} />
          <Textarea label="Question in Kinyarwanda" optional rows={3} value={form.textRw} onChange={set("textRw")} error={errors.textRw} />
          <Select
            label="Service needed on Yes"
            placeholder="Choose a service"
            options={SERVICES.map((s) => ({ value: s, label: SERVICE_LABEL[s] }))}
            value={form.service}
            onChange={set("service")}
            error={errors.service}
          />
          <Input label="Source" optional value={form.source} onChange={set("source")} hint="The guidance it comes from, e.g. WHO (2005)" autoComplete="off" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
