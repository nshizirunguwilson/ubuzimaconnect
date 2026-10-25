"use client";

import { DURATIONS, symptoms, type Duration } from "@ubuzima/shared";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LuChevronRight, LuCircleCheck, LuLoaderCircle, LuPhone, LuPhoneCall } from "react-icons/lu";
import { Confirm } from "@/components/app/confirm";
import { BottomBar } from "@/components/app/bottom-bar";
import { NotifyToggle } from "@/components/app/notify-toggle";
import { BackLink } from "@/components/patient/back-link";
import { SavedFacilities } from "@/components/patient/saved-facilities";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { ChoiceRow } from "@/components/ui/choice";
import { Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Squircle } from "@/components/ui/squircle";
import { StatusBadge } from "@/components/ui/status";
import { Chat, type ChatMsg } from "@/components/app/chat";
import { api, ApiFailure } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useOnline } from "@/lib/online";
import { useT } from "@/i18n/client";
import { flushOutbox, queueStep, readOutbox } from "@/lib/outbox";
import { check } from "@/lib/form";
import { cn } from "@/lib/cn";

export type CaseView = {
  id: string;
  code: string;
  status: "SUBMITTED" | "QUEUED" | "OFFERED" | "ASSIGNED" | "CLOSED";
  stage: "PREGNANCY" | "RED_FLAGS" | "SYMPTOMS" | "WAITING" | "CLOSED";
  urgent: boolean;
  subject: { id: string; firstName: string; name: string };
  forChild: boolean;
  question: {
    id: string;
    code: string;
    text: string;
    index: number;
    total: number;
    /** FR 3.10: the questions after this one, to keep going without a connection */
    after: { id: string; code: string; text: string }[];
  } | null;
  guidance: {
    facility: {
      name: string;
      phone: string | null;
      distance: string | null;
    } | null;
    noBeds: boolean;
    confirmed: boolean;
    expiresAt: string | null;
  } | null;
  /** FR 7.5, 7.10: the patient arrived at the facility; the visit replaces the directions. */
  visit: { facility: string; active: boolean } | null;
  /** FR 6.13: no agent is online right now */
  noAgent: boolean;
  /** FR 6.11: waited more than 5 minutes */
  delayed: boolean;
  callRequested: boolean;
  outcome: string | null;
  rating: number | null;
  withAgent: boolean;
  messages: ChatMsg[];
};

/** One screen per step of the case (GOV.UK one thing per page, RESEARCH §2.1). */
export function CaseFlow({ initial }: { initial: CaseView }) {
  const [view, setView] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  // FR 3.10: where the patient is while steps wait on the device for a connection.
  const [local, setLocal] = useState<Local | null>(null);
  const { t, tr, dateTime } = useT();
  const online = useOnline();
  const flushing = useRef(false);

  /** Keeps a step on the device and moves on without the server, as far as that is safe. */
  function keep(path: string, body: unknown) {
    queueStep(view.id, { path, body });
    if (path === "/checklist") return setLocal((body as { yes: string | null }).yes ? { kind: "yes" } : { kind: "symptoms" });
    // The pregnancy answer changes which questions follow, and symptoms need the AI: wait for the connection.
    setLocal({ kind: "waiting" });
  }

  async function post(path: string, body: unknown, key: string) {
    if (local) return keep(path, body); // keep the order: once offline, everything goes through the outbox
    setPending(key);
    setError(undefined);
    try {
      setView(await api<CaseView>(`/cases/${view.id}${path}`, body));
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 0) keep(path, body);
      else setError(e instanceof ApiFailure ? tr(e.error.message) : t.common.couldntSend);
    } finally {
      setPending(null);
    }
  }

  // When the connection comes back (or the page opens with steps still waiting), send them in order.
  useEffect(() => {
    if (!online || flushing.current || !readOutbox(view.id).length) return;
    // One sender at a time: it picks up steps queued while it runs, so nothing is sent twice.
    flushing.current = true;
    let live = true;
    void flushOutbox(
      view.id,
      async (step) => {
        const v = await api<CaseView>(`/cases/${view.id}${step.path}`, step.body);
        if (live) setView(v);
      },
      (e) => e instanceof ApiFailure && e.status === 0,
    ).then(async (result) => {
      flushing.current = false;
      if (!live || result === "offline") return;
      if (result === "rejected") setError(t.case.movedOn);
      setLocal(null);
      setView(await api<CaseView>(`/cases/${view.id}`));
    });
    return () => {
      live = false;
    };
  }, [online, view.id, local, t]);

  const name = view.forChild ? view.subject.firstName : null;

  // Live: new chat messages are added; any other change reloads the case (agent joined, routing confirmed, closed).
  const refresh = async () => setView(await api<CaseView>(`/cases/${view.id}`));
  useLive(
    view.stage === "WAITING" ? `/events/cases/${view.id}` : null,
    (e) => {
      if (e.type === "message") {
        setView((v) => (v.messages.some((m) => m.id === e.message.id) ? v : { ...v, messages: [...v.messages, e.message] }));
      } else if (e.type === "case") void refresh();
    },
    () => void refresh(),
  );

  if (local?.kind === "symptoms") return <Symptoms view={view} onDone={setView} onOffline={(data) => keep("/symptoms", data)} offline />;
  if (local) return <NotSentYet urgent={local.kind === "yes"} />;

  switch (view.stage) {
    case "PREGNANCY":
      return (
        <Question
          title={name ? t.case.pregnantThem(name) : t.case.pregnantYou}
          hint={t.case.pregnantHint}
          pending={pending}
          error={error}
          onAnswer={(yes) => post("/pregnancy", { pregnant: yes }, yes ? "yes" : "no")}
        />
      );
    case "RED_FLAGS":
      return (
        <Checklist
          name={name}
          signs={[view.question!, ...view.question!.after]}
          pending={pending}
          error={error}
          onAnswer={(yes) => post("/checklist", { yes }, yes ?? "none")}
        />
      );
    case "SYMPTOMS":
      return <Symptoms view={view} onDone={setView} onOffline={(data) => keep("/symptoms", data)} />;
    case "WAITING":
      return <Waiting view={view} onChange={setView} />;
    case "CLOSED":
      return (
        <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
          <BackLink href="/home" label={t.common.home} />
          <h1 className="text-h1 text-fg">{t.case.closedTitle}</h1>
          <p className="text-body text-fg-secondary">
            {view.outcome === "CANCELLED_BY_PATIENT" ? t.case.closedCancelled : view.visit ? t.case.closedArrived : t.case.closedByAgent} {t.case.startAgain}
          </p>
          <p className="font-mono text-small font-medium text-fg-secondary">{view.code}</p>
          {view.visit && <VisitNotice visit={view.visit} />}
          {view.guidance?.confirmed && view.guidance.facility && (
            <Notice tone="info" title={t.case.goTo(view.guidance.facility.name)}>
              {view.guidance.expiresAt ? t.case.expectingUntil(dateTime(view.guidance.expiresAt)) : null}
            </Notice>
          )}
          {view.outcome !== "CANCELLED_BY_PATIENT" && <Rating view={view} onDone={setView} />}
          <ButtonLink href="/cases/new" variant="primary" className="self-start">
            {t.case.getHelp}
          </ButtonLink>
          {/* The conversation stays readable after closing: the agent's last advice is often its final message (FR 6.9). */}
          {view.messages.length > 0 && (
            <section aria-label={t.case.chatLabel} className="flex flex-col gap-3 border-t border-border pt-4">
              <h2 className="text-h3 text-fg">{t.case.messages}</h2>
              <Chat
                me="PATIENT"
                messages={view.messages}
                disabled
                voice={{ send: async () => {}, url: (m) => `/api/cases/${view.id}/voice/${m}` }}
                labels={{ messages: t.case.messages, empty: t.chat.empty, you: t.common.you, agent: t.chat.agent, send: t.chat.send, quickReplies: t.chat.quickReplies, quick: t.chat.quick, system: tr, record: t.chat.record, recording: t.chat.recording, sendVoice: t.chat.sendVoice, cancelVoice: t.chat.cancelVoice, voiceNote: t.chat.voiceNote, micBlocked: t.chat.micBlocked }}
                onSend={async () => {}}
              />
            </section>
          )}
        </main>
      );
  }
}

/**
 * FR 3.6, 4.1: every danger sign for this person on one screen, grouped as in Appendix C. Tapping one is a Yes and
 * makes the case Urgent at once. "None of these" comes after the last sign, so it can only be reached past all of them.
 */
function Checklist({
  name,
  signs,
  pending,
  error,
  onAnswer,
}: {
  name: string | null;
  signs: { id: string; code: string; text: string }[];
  pending: string | null;
  error?: string;
  onAnswer: (yes: string | null) => void;
}) {
  const { t } = useT();
  const groups = [...new Set(signs.map((s) => s.code[0]))];
  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[560px]">
      <BackLink href="/home" label={t.common.home} />
      <div className="flex flex-col gap-3">
        <h1 className="text-h1 text-fg">{name ? t.case.checklistThem(name) : t.case.checklistYou}</h1>
        <p className="text-body text-fg-secondary">{t.case.checklistHint}</p>
      </div>
      {error && <Notice tone="urgent" title={error} />}
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2" aria-labelledby={`signs-${g}`}>
          <h2 id={`signs-${g}`} className="text-small font-semibold text-fg-secondary">
            {t.case.checklistGroups[g]}
          </h2>
          {signs
            .filter((s) => s.code[0] === g)
            .map((s) => (
              <Squircle
                key={s.id}
                as="button"
                type="button"
                radius="md"
                disabled={!!pending}
                onClick={() => onAnswer(s.id)}
                className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-left sq-bg-surface sq-border-border-strong hover:sq-bg-gray-50 disabled:cursor-not-allowed"
              >
                <span className="flex-1 text-body text-fg">{s.text}</span>
                {pending === s.id ? (
                  <LuLoaderCircle className="size-5 shrink-0 animate-spin text-fg-secondary" aria-hidden />
                ) : (
                  <LuChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden />
                )}
              </Squircle>
            ))}
        </section>
      ))}
      <Button variant="primary" className="h-14 text-body md:h-12 md:self-start" loading={pending === "none"} disabled={!!pending} onClick={() => onAnswer(null)}>
        {t.case.noneOfThese}
      </Button>
    </main>
  );
}

/** A yes/no question with two big answers. Neither is red: red is for the result, not the question. */
function Question({
  title,
  hint,
  pending,
  error,
  onAnswer,
}: {
  title: string;
  hint: string;
  pending: string | null;
  error?: string;
  onAnswer: (yes: boolean) => void;
}) {
  const { t } = useT();
  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <BackLink href="/home" label={t.common.home} />
      <div className="flex flex-col gap-3">
        <h1 className="text-h1 text-fg">{title}</h1>
        <p className="text-body text-fg-secondary">{hint}</p>
      </div>
      {error && <Notice tone="urgent" title={error} />}
      <div className="flex-1" />
      <BottomBar>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-start">
          <Button variant="secondary" className="h-14 text-body md:h-12" loading={pending === "no"} disabled={!!pending} onClick={() => onAnswer(false)}>
            {t.common.no}
          </Button>
          <Button variant="secondary" className="h-14 text-body md:h-12" loading={pending === "yes"} disabled={!!pending} onClick={() => onAnswer(true)}>
            {t.common.yes}
          </Button>
        </div>
      </BottomBar>
    </main>
  );
}

/** FR 3.7: own words, how long, how bad. The AI has up to 10 seconds (FR 4.3). */
function Symptoms({ view, onDone, onOffline, offline }: { view: CaseView; onDone: (v: CaseView) => void; onOffline: (data: unknown) => void; offline?: boolean }) {
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<Duration | "">("");
  const [severity, setSeverity] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const { t, tr } = useT();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = check(symptoms, {
      description,
      duration: duration || undefined,
      severity: severity ?? 0,
    });
    if (!r.data) return setErrors(Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [k, tr(v)])));
    setErrors({});
    if (offline) return onOffline(r.data);
    setPending(true);
    try {
      onDone(await api<CaseView>(`/cases/${view.id}/symptoms`, r.data));
    } catch (err) {
      setPending(false);
      if (err instanceof ApiFailure && err.status === 0) return onOffline(r.data);
      setErrors({
        form: err instanceof ApiFailure ? tr(err.error.message) : t.common.couldntSend,
      });
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <BackLink href="/home" label={t.common.home} />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-fg">{t.case.whatsWrong}</h1>
        <p className="text-body text-fg-secondary">{t.case.noDangerSigns}</p>
      </div>
      <form onSubmit={submit} noValidate className="flex flex-col gap-8">
        <Textarea
          label={view.forChild ? t.case.describeThem(view.subject.firstName) : t.case.describeYou}
          hint={t.case.describeHint}
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium text-fg">{t.case.howLong}</legend>
          {DURATIONS.map((d) => (
            <ChoiceRow key={d} name="duration" value={d} label={t.case.durations[d]} checked={duration === d} onChange={() => setDuration(d)} />
          ))}
          {errors.duration && <p className="text-small font-medium text-urgent-fg">{errors.duration}</p>}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-small font-medium text-fg">{t.case.howBad}</legend>
          <p className="text-small text-fg-secondary">{t.case.howBadHint}</p>
          <div role="radiogroup" aria-label={t.case.howBadAria} className="grid grid-cols-5 gap-2 sm:flex">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Squircle
                key={n}
                as="button"
                type="button"
                role="radio"
                aria-checked={severity === n}
                radius="md"
                focus="self"
                onClick={() => setSeverity(n)}
                className={cn(
                  "flex h-12 cursor-pointer items-center justify-center text-body font-medium tabular-nums sm:w-12",
                  severity === n ? "sq-bg-accent-soft sq-border-primary text-info-fg" : "sq-bg-surface sq-border-border-strong text-fg hover:sq-bg-gray-50",
                )}
              >
                {n}
              </Squircle>
            ))}
          </div>
          {errors.severity && <p className="text-small font-medium text-urgent-fg">{errors.severity}</p>}
        </fieldset>
        {errors.form && <Notice tone="urgent" title={errors.form} />}
        {offline && <OfflineNote />}
        <BottomBar>
          <Button type="submit" variant="primary" loading={pending} className="w-full sm:w-auto sm:self-start">
            {pending ? t.case.sending : t.case.send}
          </Button>
        </BottomBar>
      </form>
    </main>
  );
}

/** After triage. Urgent: go now, with the facility and 912 (FR 5.5, 5.8, 5.9). Otherwise: an agent will reply. */
function Waiting({ view, onChange }: { view: CaseView; onChange: (v: CaseView) => void }) {
  const g = view.guidance;
  const { t, tr, dateTime } = useT();
  return (
    <main className="flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-x-12">
      <BackLink href="/home" label={t.common.home} />
      <div className="flex flex-col gap-6 lg:col-start-1">
        {view.visit ? (
          <VisitNotice visit={view.visit} />
        ) : view.urgent ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-display text-urgent-fg">{g?.facility ? t.case.goNow : t.case.call912Now}</h1>
              <p className="text-body text-fg">
                {g?.confirmed && g.expiresAt
                  ? t.case.confirmedUntil(dateTime(g.expiresAt))
                  : t.case.willContact}
              </p>
            </div>
            {g?.facility && (
              <Card className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-caption text-fg-muted">
                    {t.case.nearest}
                    {g.facility.distance ? ` · ${g.facility.distance}` : ""}
                  </p>
                  <h2 className="text-h2 text-fg">{g.facility.name}</h2>
                  {g.noBeds && <StatusBadge tone="warning">{t.case.noBeds}</StatusBadge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.facility.phone && (
                    <ButtonLink href={`tel:${g.facility.phone.replace(/\s/g, "")}`} variant="secondary" icon={<LuPhone />}>
                      {t.case.callFacility}
                    </ButtonLink>
                  )}
                </div>
              </Card>
            )}
            <ButtonLink href="tel:912" variant="danger" icon={<LuPhone />} className="h-14 w-full text-body md:h-14">
              {t.common.call912}
            </ButtonLink>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-h1 text-fg">
                {view.withAgent ? t.case.helping : view.noAgent ? t.case.noAgent : t.case.willReply}
              </h1>
              <p className="text-body text-fg-secondary">
                {/* FR 6.13: the SRS wording for a Minor case with no agent online */}
                {view.withAgent
                  ? t.case.helpingBody
                  : view.noAgent
                  ? t.case.noAgentBody
                  : view.delayed
                    ? t.case.delayedBody
                    : view.forChild
                      ? t.case.waitingThem(view.subject.firstName)
                      : t.case.waitingYou}
              </p>
            </div>
            {/* FR 6.11, 6.13: an Uncertain case nobody can answer yet shows the nearest suitable facility and 912 */}
            {g?.facility && !g.confirmed && (
              <>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-caption text-fg-muted">
                      {t.case.nearest}
                      {g.facility.distance ? ` · ${g.facility.distance}` : ""}
                    </p>
                    <h2 className="text-h2 text-fg">{g.facility.name}</h2>
                  </div>
                  {g.facility.phone && (
                    <ButtonLink href={`tel:${g.facility.phone.replace(/\s/g, "")}`} variant="secondary" icon={<LuPhone />} className="self-start">
                      {t.case.callFacility}
                    </ButtonLink>
                  )}
                </Card>
                <ButtonLink href="tel:912" variant="danger" icon={<LuPhone />} className="w-full">
                  {t.common.call912}
                </ButtonLink>
              </>
            )}
            {view.guidance?.confirmed && view.guidance.facility ? (
              <Card highlighted className="flex flex-col gap-2">
                <span className="text-caption text-fg-muted">
                  {t.case.sentYouTo}
                  {view.guidance.facility.distance ? ` · ${view.guidance.facility.distance}` : ""}
                </span>
                <h2 className="text-h2 text-fg">{view.guidance.facility.name}</h2>
                {view.guidance.expiresAt && (
                  <p className="text-small text-fg-secondary">{t.case.expectingUntil(dateTime(view.guidance.expiresAt))}</p>
                )}
                {view.guidance.facility.phone && (
                  <ButtonLink href={`tel:${view.guidance.facility.phone.replace(/\s/g, "")}`} variant="secondary" icon={<LuPhone />} className="self-start">
                    {t.case.callFacility}
                  </ButtonLink>
                )}
              </Card>
            ) : (
              <Card highlighted className="flex items-center gap-3">
                <LuCircleCheck className="size-6 shrink-0 text-info-fg" aria-hidden />
                <div className="flex flex-col">
                  <span className="text-body font-semibold text-fg">{view.withAgent ? t.case.agentHasIt : t.case.sent}</span>
                  <span className="font-mono text-small font-medium text-fg-secondary">{view.code}</span>
                </div>
              </Card>
            )}
            {!view.withAgent && <NotifyToggle who="patient" />}
            {view.callRequested ? (
              <Notice tone="info" title={t.case.callRequested}>
                {t.case.callRequestedBody}
              </Notice>
            ) : (
              <ButtonLink href={`/call?case=${view.id}`} variant="secondary" icon={<LuPhoneCall />} className="self-start">
                {t.case.preferCall}
              </ButtonLink>
            )}
            <Link href="/emergency" className="inline-flex min-h-11 w-fit items-center gap-2 text-small font-semibold text-urgent-fg">
              <LuPhone className="size-4" aria-hidden />
              {t.case.ifWorse}
            </Link>
          </>
        )}
      </div>
      {/* From 1024 px the chat sits beside the guidance */}
      <section
        aria-label={t.case.chatLabel}
        className="flex flex-col gap-3 border-t border-border pt-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:h-[calc(100dvh-10rem)] lg:border-t-0 lg:pt-0"
      >
        <h2 className="text-h3 text-fg">{t.case.messages}</h2>
        <Chat
          me="PATIENT"
          messages={view.messages}
          quickReplies={view.withAgent}
          voice={{
            url: (m) => `/api/cases/${view.id}/voice/${m}`,
            send: async (audio, durationMs) => {
              const { id } = await api<{ id: string }>(`/cases/${view.id}/voice`, { audio, durationMs });
              onChange({
                ...view,
                messages: view.messages.some((m) => m.id === id)
                  ? view.messages
                  : [...view.messages, { id, sender: "PATIENT", text: "Voice note", createdAt: new Date().toISOString(), audioMs: durationMs }],
              });
            },
          }}
          placeholder={view.withAgent ? t.case.writeToAgent : t.case.addSomething}
          labels={{ messages: t.case.messages, empty: t.chat.empty, you: t.common.you, agent: t.chat.agent, send: t.chat.send, quickReplies: t.chat.quickReplies, quick: t.chat.quick, system: tr, record: t.chat.record, recording: t.chat.recording, sendVoice: t.chat.sendVoice, cancelVoice: t.chat.cancelVoice, voiceNote: t.chat.voiceNote, micBlocked: t.chat.micBlocked }}
          onSend={async (text) => {
            const { id } = await api<{ id: string }>(`/cases/${view.id}/messages`, { text });
            onChange({
              ...view,
              messages: view.messages.some((m) => m.id === id)
                ? view.messages
                : [
                    ...view.messages,
                    {
                      id,
                      sender: "PATIENT",
                      text,
                      createdAt: new Date().toISOString(),
                    },
                  ],
            });
          }}
        />
      </section>
      <div className="flex-1 lg:hidden" />
      {!view.visit?.active && (
        <Confirm
          trigger={
            <Button variant="ghost" className="self-start lg:col-start-1">
              {t.case.noLongerNeed}
            </Button>
          }
          title={t.case.closeQ}
          description={t.case.closeBody}
          confirmLabel={t.case.closeConfirm}
          onConfirm={async () => onChange(await api<CaseView>(`/cases/${view.id}/cancel`, {}))}
        />
      )}
    </main>
  );
}

/** FR 6.15: rate the help from 1 to 5, once. */
function Rating({ view, onDone }: { view: CaseView; onDone: (v: CaseView) => void }) {
  const [pending, setPending] = useState<number | null>(null);
  const { t } = useT();
  if (view.rating !== null) {
    return (
      <Notice tone="success" title={t.case.thanks}>
        {t.case.rated(view.rating)}
      </Notice>
    );
  }
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-h3 font-heading font-semibold text-fg">{t.case.rateQ}</legend>
      <p className="text-small text-fg-secondary">{t.case.rateHint}</p>
      <div className="grid grid-cols-5 gap-2 sm:flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button
            key={n}
            variant="secondary"
            className="h-12 text-body sm:w-12"
            loading={pending === n}
            disabled={pending !== null}
            aria-label={t.common.outOf5(n)}
            onClick={async () => {
              setPending(n);
              try {
                onDone(
                  await api<CaseView>(`/cases/${view.id}/rating`, {
                    rating: n,
                  }),
                );
              } catch {
                setPending(null);
              }
            }}
          >
            {n}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** FR 7.5, 7.10: once the clinician marks the patient arrived, the directions are no longer needed. */
function VisitNotice({ visit }: { visit: NonNullable<CaseView["visit"]> }) {
  const { t } = useT();
  return visit.active ? (
    <Notice tone="success" title={t.case.inCare(visit.facility)}>
      {t.case.inCareBody}
    </Notice>
  ) : (
    <Notice tone="info" title={t.case.visitEnded(visit.facility)}>
      {t.case.visitEndedBody}
    </Notice>
  );
}

type Local =
  | { kind: "symptoms" }
  | { kind: "yes" }
  | { kind: "waiting" };

/** FR 3.10: while answers wait on the device. */
function OfflineNote() {
  const { t } = useT();
  return (
    <Notice tone="warning" title={t.offline.noConnection}>
      {t.offline.keepGoing}
    </Notice>
  );
}

/**
 * FR 3.10: the request waits on the device. With a danger sign answered Yes, the patient is told to act now,
 * whatever the connection does. The saved facilities may be out of date, and say so.
 */
function NotSentYet({ urgent }: { urgent: boolean }) {
  const { t } = useT();
  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[480px]">
      <BackLink href="/home" label={t.common.home} />
      {urgent ? (
        <h1 className="text-display text-urgent-fg">{t.offline.goNow}</h1>
      ) : (
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-fg">{t.offline.notSent}</h1>
          <p className="text-body text-fg-secondary">{t.offline.savedAnswers}</p>
        </div>
      )}
      <ButtonLink href="tel:912" variant="danger" icon={<LuPhone />} className="h-14 w-full text-body md:h-14">
        {t.common.call912}
      </ButtonLink>
      {urgent && <p className="text-small font-medium text-fg-secondary">{t.offline.notSentShort}</p>}
      <SavedFacilities />
    </main>
  );
}
