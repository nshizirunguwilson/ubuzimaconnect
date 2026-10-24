import { en, type Messages } from "./en";
import { rw } from "./rw";

export type Lang = "en" | "rw";
export const LANG_COOKIE = "uc_lang";
export const messages: Record<Lang, Messages> = { en, rw };
export const asLang = (v: string | undefined | null): Lang => (v === "rw" ? "rw" : "en");
export type { Messages };
