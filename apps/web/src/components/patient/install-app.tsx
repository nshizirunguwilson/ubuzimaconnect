"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { LuDownload, LuShare } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noop = () => () => {};
const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !("MSStream" in window);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * NFR 8: installing puts UbuzimaConnect on the home screen, opens the emergency page without a connection,
 * and is what lets an iPhone get notifications. Chrome, Edge and Android offer it with one button; iPhone
 * Safari has no prompt, so it says where the option is. Nothing shows once installed.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const { t } = useT();
  const iphone = useSyncExternalStore(noop, isIphone, () => false);
  const done = useSyncExternalStore(noop, installed, () => true);

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  if (done) return null;
  if (prompt) {
    return (
      <Button
        variant="ghost"
        size="compact"
        icon={<LuDownload />}
        className="self-start"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        {t.install.button}
      </Button>
    );
  }
  if (iphone) {
    return (
      <p className="flex items-start gap-2 text-small text-fg-secondary">
        <LuShare className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t.install.iphone}
      </p>
    );
  }
  return null;
}
