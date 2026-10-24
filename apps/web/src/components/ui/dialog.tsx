"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { useT } from "@/i18n/client";
import { Squircle } from "./squircle";

/**
 * Dialog / bottom sheet (DESIGN.md §9): one clear title, a primary and a secondary action.
 * On phones it is a bottom sheet (top corners only); from sm up it is a centred dialog.
 */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  /** Secondary first, primary last: the primary is on top on phones (nearest the thumb is the safe choice) and on the right on desktop. */
  actions: ReactNode;
}) {
  const { t } = useT();
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-[fade_200ms_var(--ease-out)]" />
      <RadixDialog.Content asChild {...(!description && { "aria-describedby": undefined })}>
        <Squircle
          radius="xl"
          corners="sheet"
          elevated
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col outline-none sq-bg-surface data-[state=open]:animate-[rise_200ms_var(--ease-out)] sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(28rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:data-[state=open]:animate-[fade_200ms_var(--ease-out)]"
        >
          {/* Scrolls inside the shape, so the squircle layer and shadow are never clipped */}
          <div className="flex flex-col gap-6 overflow-y-auto p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <RadixDialog.Title className="font-heading text-h2 font-semibold text-fg">{title}</RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-body text-fg-secondary">{description}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <Squircle
                as="button"
                type="button"
                radius="sm"
                focus="self"
                aria-label={t.common.close}
                className="-mt-2 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-fg-secondary hover:sq-bg-sunken"
              >
                <LuX className="size-5" aria-hidden />
              </Squircle>
            </RadixDialog.Close>
          </div>
          {children}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
          </div>
        </Squircle>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
