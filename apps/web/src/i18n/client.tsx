"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatDateIn, formatDateTimeIn, formatTimeIn } from "./dates";
import { LANG_COOKIE, messages, type Lang } from "./index";
import { translate } from "./sentences";

const LangContext = createContext<Lang>("en");

/**
 * Set once in the patient layout from the cookie, so every screen renders in one language with no flash.
 * The lang attribute tells screen readers to pronounce Kinyarwanda as Kinyarwanda (WCAG 3.1.2);
 * "contents" keeps the wrapper out of the layout.
 */
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <LangContext.Provider value={lang}>
      <div lang={lang} className="contents">
        {children}
      </div>
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);

/** The texts, the date formats and the server-sentence translator for the current language. */
export function useT() {
  const lang = useLang();
  return useMemo(
    () => ({
      t: messages[lang],
      lang,
      tr: (text: string) => translate(lang, text),
      date: (iso: string | Date) => formatDateIn(lang, iso),
      time: (iso: string | Date) => formatTimeIn(lang, iso),
      dateTime: (iso: string | Date) => formatDateTimeIn(lang, iso),
    }),
    [lang],
  );
}

/** Remembered on this device for a year; the server reads it to render pages in this language. */
function rememberLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * NFR 7: English or Kinyarwanda, remembered on this device for a year. A logged-in patient's choice is also
 * saved on their record, so red-flag questions and notifications follow it.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  async function choose(next: Lang) {
    if (next === lang) return;
    rememberLang(next);
    await fetch("/api/me/lang", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: next }) }).catch(() => null);
    router.refresh();
  }
  return (
    <div role="group" aria-label={t.lang.label} className={cn("flex items-center gap-1 text-small", className)}>
      {(["rw", "en"] as const).map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="text-fg-muted">·</span>}
          <button
            type="button"
            lang={l}
            aria-pressed={lang === l}
            onClick={() => choose(l)}
            className={cn("min-h-11 cursor-pointer px-1.5 font-medium", lang === l ? "text-fg underline decoration-2 underline-offset-4" : "text-link")}
          >
            {messages[l].lang[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
