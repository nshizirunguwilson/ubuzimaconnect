"use client";

import Link from "next/link";
import { useState } from "react";
import { PiCheckCircleBold, PiPhoneBold, PiPhoneCallBold } from "react-icons/pi";
import { Confirm } from "@/components/app/confirm";
import { NotifyToggle } from "@/components/app/notify-toggle";
import { BackLink } from "@/components/patient/back-link";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status";
import { Chat } from "@/components/app/chat";
import { api } from "@/lib/api";
import { useT } from "@/i18n/client";
import type { CaseView } from "./case-flow";

/** After triage. Urgent: go now, with the facility and 912. Otherwise: an agent will reply. */
export function Waiting({ view, onChange }: { view: CaseView; onChange: (v: CaseView) => void }) {
  const where = view.guidance;
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
              <h1 className="text-display text-urgent-fg">{where?.facility ? t.case.goNow : t.case.call912Now}</h1>
              <p className="text-body text-fg">
                {where?.confirmed && where.expiresAt
                  ? t.case.confirmedUntil(dateTime(where.expiresAt))
                  : t.case.willContact}
              </p>
            </div>
            {where?.facility && (
              <Card className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-caption text-fg-muted">
                    {t.case.nearest}
                    {where.facility.distance ? ` · ${where.facility.distance}` : ""}
                  </p>
                  <h2 className="text-h2 text-fg">{where.facility.name}</h2>
                  {where.noBeds && <StatusBadge tone="warning">{t.case.noBeds}</StatusBadge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {where.facility.phone && (
                    <ButtonLink
                      href={`tel:${where.facility.phone.replace(/\s/g, "")}`}
                      variant="secondary"
                      icon={<PiPhoneBold />}
                    >
                      {t.case.callFacility}
                    </ButtonLink>
                  )}
                </div>
              </Card>
            )}
            <ButtonLink
              href="tel:912"
              variant="danger"
              icon={<PiPhoneBold />}
              className="h-14 w-full text-body md:h-14"
            >
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
                {/* The SRS wording for a Minor case with no agent online */}
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
            {/* An Uncertain case nobody can answer yet shows the nearest suitable facility and 912 */}
            {where?.facility && !where.confirmed && (
              <>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-caption text-fg-muted">
                      {t.case.nearest}
                      {where.facility.distance ? ` · ${where.facility.distance}` : ""}
                    </p>
                    <h2 className="text-h2 text-fg">{where.facility.name}</h2>
                  </div>
                  {where.facility.phone && (
                    <ButtonLink
                      href={`tel:${where.facility.phone.replace(/\s/g, "")}`}
                      variant="secondary"
                      icon={<PiPhoneBold />}
                      className="self-start"
                    >
                      {t.case.callFacility}
                    </ButtonLink>
                  )}
                </Card>
                <ButtonLink href="tel:912" variant="danger" icon={<PiPhoneBold />} className="w-full">
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
                  <p className="text-small text-fg-secondary">
                    {t.case.expectingUntil(dateTime(view.guidance.expiresAt))}
                  </p>
                )}
                {view.guidance.facility.phone && (
                  <ButtonLink
                    href={`tel:${view.guidance.facility.phone.replace(/\s/g, "")}`}
                    variant="secondary"
                    icon={<PiPhoneBold />}
                    className="self-start"
                  >
                    {t.case.callFacility}
                  </ButtonLink>
                )}
              </Card>
            ) : (
              <Card highlighted className="flex items-center gap-3">
                <PiCheckCircleBold className="size-6 shrink-0 text-info-fg" aria-hidden />
                <div className="flex flex-col">
                  <span className="text-body font-semibold text-fg">
                    {view.withAgent ? t.case.agentHasIt : t.case.sent}
                  </span>
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
              <ButtonLink
                href={`/call?case=${view.id}`}
                variant="secondary"
                icon={<PiPhoneCallBold />}
                className="self-start"
              >
                {t.case.preferCall}
              </ButtonLink>
            )}
            <Link
              href="/emergency"
              className="inline-flex min-h-11 w-fit items-center gap-2 text-small font-semibold text-urgent-fg"
            >
              <PiPhoneBold className="size-4" aria-hidden />
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
            url: (messageId) => `/api/cases/${view.id}/voice/${messageId}`,
            send: async (audio, durationMs) => {
              const { id } = await api<{ id: string }>(`/cases/${view.id}/voice`, { audio, durationMs });
              onChange({
                ...view,
                messages: view.messages.some((message) => message.id === id)
                  ? view.messages
                  : [
                      ...view.messages,
                      {
                        id,
                        sender: "PATIENT",
                        text: "Voice note",
                        createdAt: new Date().toISOString(),
                        audioMs: durationMs,
                      },
                    ],
              });
            },
          }}
          placeholder={view.withAgent ? t.case.writeToAgent : t.case.addSomething}
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
          onSend={async (text) => {
            const { id } = await api<{ id: string }>(`/cases/${view.id}/messages`, { text });
            onChange({
              ...view,
              messages: view.messages.some((message) => message.id === id)
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

/** Rate the help from 1 to 5, once. */
export function Rating({ view, onDone }: { view: CaseView; onDone: (v: CaseView) => void }) {
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
        {[1, 2, 3, 4, 5].map((stars) => (
          <Button
            key={stars}
            variant="secondary"
            className="h-12 text-body sm:w-12"
            loading={pending === stars}
            disabled={pending !== null}
            aria-label={t.common.outOf5(stars)}
            onClick={async () => {
              setPending(stars);
              try {
                onDone(
                  await api<CaseView>(`/cases/${view.id}/rating`, {
                    rating: stars,
                  }),
                );
              } catch {
                setPending(null);
              }
            }}
          >
            {stars}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** Once the clinician marks the patient arrived, the directions are no longer needed. */
export function VisitNotice({ visit }: { visit: NonNullable<CaseView["visit"]> }) {
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
