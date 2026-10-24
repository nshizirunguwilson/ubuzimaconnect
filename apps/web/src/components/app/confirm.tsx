"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/i18n/client";

/** An action behind a dialog that says what will happen (DESIGN.md §9). */
export function Confirm({
  trigger,
  title,
  description,
  confirmLabel,
  variant = "danger",
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  /** Danger for actions that lose or end something; primary for a confirmed step that loses nothing. */
  variant?: "danger" | "primary";
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={title}
        description={description}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant={variant}
              loading={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setPending(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
