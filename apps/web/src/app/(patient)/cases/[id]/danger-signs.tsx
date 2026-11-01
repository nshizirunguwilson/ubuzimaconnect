"use client";

import { PiCaretRightBold, PiCircleNotchBold } from "react-icons/pi";
import { BottomBar } from "@/components/app/bottom-bar";
import { BackLink } from "@/components/patient/back-link";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Squircle } from "@/components/ui/squircle";
import { useT } from "@/i18n/client";

/**
 * Every danger sign for this person on one screen, grouped as in Appendix C. Tapping one is a Yes and
 * makes the case Urgent at once. "None of these" comes after the last sign, so it can only be reached past all of them.
 */
export function Checklist({
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
  const groups = [...new Set(signs.map((sign) => sign.code[0]))];
  return (
    <main className="flex flex-1 flex-col gap-6 lg:mx-auto lg:w-full lg:max-w-[560px]">
      <BackLink href="/home" label={t.common.home} />
      <div className="flex flex-col gap-3">
        <h1 className="text-h1 text-fg">{name ? t.case.checklistThem(name) : t.case.checklistYou}</h1>
        <p className="text-body text-fg-secondary">{t.case.checklistHint}</p>
      </div>
      {error && <Notice tone="urgent" title={error} />}
      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-2" aria-labelledby={`signs-${group}`}>
          <h2 id={`signs-${group}`} className="text-small font-semibold text-fg-secondary">
            {t.case.checklistGroups[group]}
          </h2>
          {signs
            .filter((sign) => sign.code[0] === group)
            .map((sign) => (
              <Squircle
                key={sign.id}
                as="button"
                type="button"
                radius="md"
                disabled={!!pending}
                onClick={() => onAnswer(sign.id)}
                className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-left sq-bg-surface sq-border-border-strong hover:sq-bg-gray-50 disabled:cursor-not-allowed"
              >
                <span className="flex-1 text-body text-fg">{sign.text}</span>
                {pending === sign.id ? (
                  <PiCircleNotchBold className="size-5 shrink-0 animate-spin text-fg-secondary" aria-hidden />
                ) : (
                  <PiCaretRightBold className="size-5 shrink-0 text-fg-muted" aria-hidden />
                )}
              </Squircle>
            ))}
        </section>
      ))}
      <Button
        variant="primary"
        className="h-14 text-body md:h-12 md:self-start"
        loading={pending === "none"}
        disabled={!!pending}
        onClick={() => onAnswer(null)}
      >
        {t.case.noneOfThese}
      </Button>
    </main>
  );
}

/** A yes/no question with two big answers. Neither is red: red is for the result, not the question. */
export function Question({
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
          <Button
            variant="secondary"
            className="h-14 text-body md:h-12"
            loading={pending === "no"}
            disabled={!!pending}
            onClick={() => onAnswer(false)}
          >
            {t.common.no}
          </Button>
          <Button
            variant="secondary"
            className="h-14 text-body md:h-12"
            loading={pending === "yes"}
            disabled={!!pending}
            onClick={() => onAnswer(true)}
          >
            {t.common.yes}
          </Button>
        </div>
      </BottomBar>
    </main>
  );
}
