"use client";

import type { PatientMe, StaffMe } from "@ubuzima/shared";
import { useEffect, useState } from "react";
import { LuBell, LuBellOff } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { usePending } from "@/lib/pending";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push";
import { useT } from "@/i18n/client";

const WHY = {
  patient: "Get a notification when the agent replies, even with the app closed.",
  clinician: "Get a notification when a patient is assigned or handed over to you, even with the app closed.",
};

/**
 * FR 6.6, 5.12: notifications are asked for where they help, not at login (people refuse prompts with no
 * reason). The browser's own prompt follows the button. NFR 13: they only say "You have a new message."
 * FR 1.8: never offered on a shared device.
 */
export function NotifyToggle({ who }: { who: keyof typeof WHY }) {
  const [state, setState] = useState<PushState | null>(null);
  const { t } = useT();
  const [pending, setPending] = usePending(false);

  useEffect(() => {
    let live = true;
    Promise.all([pushState(), api<PatientMe | StaffMe>("/auth/me")]).then(
      ([s, me]) => live && setState(me.kind === "patient" && me.sharedDevice ? "unsupported" : s),
      () => live && setState("unsupported"),
    );
    return () => {
      live = false;
    };
  }, []);

  // Not offered where it can't work (or on a shared device); nothing to explain there.
  if (!state || state === "unsupported") return null;

  async function change(on: boolean) {
    setPending(true);
    try {
      const next = on ? await turnOnPush() : await turnOffPush();
      setState(next);
      if (next === "on") toast.success(t.notify.nowOn);
      if (next === "off" && !on) toast.success(t.notify.nowOff);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.notify.failed);
    } finally {
      setPending(false);
    }
  }

  if (state === "on") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-fg-secondary">
        <LuBell className="size-4 text-success" aria-hidden />
        <span>{t.notify.on}</span>
        <Button variant="ghost" size="compact" loading={pending} onClick={() => change(false)}>
          {t.notify.turnOff}
        </Button>
      </div>
    );
  }
  if (state === "blocked") {
    return (
      <p className="flex items-start gap-2 text-small text-fg-secondary">
        <LuBellOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t.notify.blocked}
      </p>
    );
  }
  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <LuBell className="mt-0.5 size-5 shrink-0 text-info-fg" aria-hidden />
        <div className="flex flex-col">
          <span className="text-body text-fg">{who === "patient" ? t.notify.why : WHY.clinician}</span>
          <span className="text-small text-fg-secondary">{who === "patient" ? t.notify.only : "It only says “You have a new message”, nothing about your health."}</span>
        </div>
      </div>
      <Button variant="secondary" loading={pending} onClick={() => change(true)} className="shrink-0">
        {t.notify.turnOn}
      </Button>
    </Card>
  );
}
