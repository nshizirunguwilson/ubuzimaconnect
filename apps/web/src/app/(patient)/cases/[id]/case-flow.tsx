"use client";

import { useEffect, useRef, useState } from "react";
import { LuPhone } from "react-icons/lu";

import { BackLink } from "@/components/patient/back-link";
import { SavedFacilities } from "@/components/patient/saved-facilities";

import { ButtonLink } from "@/components/ui/button-link";

import { Notice } from "@/components/ui/notice";

import { Chat, type ChatMsg } from "@/components/app/chat";
import { api, ApiFailure } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useOnline } from "@/lib/online";
import { useT } from "@/i18n/client";
import { flushOutbox, queueStep, readOutbox } from "@/lib/outbox";

import { Waiting, Rating, VisitNotice } from "./waiting";
import { Symptoms } from "./symptoms";
import { Checklist, Question } from "./danger-signs";

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
    /** The questions after this one, to keep going without a connection */
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
  /** The patient arrived at the facility; the visit replaces the directions. */
  visit: { facility: string; active: boolean } | null;
  /** No agent is online right now */
  noAgent: boolean;
  /** Waited more than 5 minutes */
  delayed: boolean;
  callRequested: boolean;
  outcome: string | null;
  rating: number | null;
  withAgent: boolean;
  messages: ChatMsg[];
};

/** One screen per step of the case, following GOV.UK's "one thing per page". */
export function CaseFlow({ initial }: { initial: CaseView }) {
  const [view, setView] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  // Where the patient is while steps wait on the device for a connection.
  const [local, setLocal] = useState<Local | null>(null);
  const { t, tr, dateTime } = useT();
  const online = useOnline();
  const flushing = useRef(false);

  /** Keeps a step on the device and moves on without the server, as far as that is safe. */
  function keep(path: string, body: unknown) {
    queueStep(view.id, { path, body });
    if (path === "/checklist")
      return setLocal((body as { yes: string | null }).yes ? { kind: "yes" } : { kind: "symptoms" });
    // The pregnancy answer changes which questions follow, and symptoms need the AI: wait for the connection.
    setLocal({ kind: "waiting" });
  }

  async function post(path: string, body: unknown, key: string) {
    if (local) return keep(path, body); // keep the order: once offline, everything goes through the outbox
    setPending(key);
    setError(undefined);
    try {
      setView(await api<CaseView>(`/cases/${view.id}${path}`, body));
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 0) keep(path, body);
      else setError(error instanceof ApiFailure ? tr(error.error.message) : t.common.couldntSend);
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
        const updated = await api<CaseView>(`/cases/${view.id}${step.path}`, step.body);
        if (live) setView(updated);
      },
      (error) => error instanceof ApiFailure && error.status === 0,
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
    (event) => {
      if (event.type === "message") {
        setView((previous) =>
          previous.messages.some((shown) => shown.id === event.message.id)
            ? previous
            : { ...previous, messages: [...previous.messages, event.message] },
        );
      } else if (event.type === "case") void refresh();
    },
    () => void refresh(),
  );

  if (local?.kind === "symptoms")
    return <Symptoms view={view} onDone={setView} onOffline={(data) => keep("/symptoms", data)} offline />;
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
            {view.outcome === "CANCELLED_BY_PATIENT"
              ? t.case.closedCancelled
              : view.visit
                ? t.case.closedArrived
                : t.case.closedByAgent}{" "}
            {t.case.startAgain}
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
          {/* The conversation stays readable after closing: the agent's last advice is often its final message. */}
          {view.messages.length > 0 && (
            <section aria-label={t.case.chatLabel} className="flex flex-col gap-3 border-t border-border pt-4">
              <h2 className="text-h3 text-fg">{t.case.messages}</h2>
              <Chat
                me="PATIENT"
                messages={view.messages}
                disabled
                voice={{ send: async () => {}, url: (messageId) => `/api/cases/${view.id}/voice/${messageId}` }}
                labels={{
                  messages: t.case.messages,
                  empty: t.chat.empty,
                  you: t.common.you,
                  agent: t.chat.agent,
                  send: t.chat.send,
                  quickReplies: t.chat.quickReplies,
                  quick: t.chat.quick,
                  system: tr,
                  record: t.chat.record,
                  recording: t.chat.recording,
                  sendVoice: t.chat.sendVoice,
                  cancelVoice: t.chat.cancelVoice,
                  voiceNote: t.chat.voiceNote,
                  micBlocked: t.chat.micBlocked,
                }}
                onSend={async () => {}}
              />
            </section>
          )}
        </main>
      );
  }
}

type Local = { kind: "symptoms" } | { kind: "yes" } | { kind: "waiting" };

/**
 * The request waits on the device. With a danger sign answered Yes, the patient is told to act now,
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
