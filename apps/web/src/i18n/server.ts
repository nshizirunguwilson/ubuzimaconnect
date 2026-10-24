import "server-only";
import { cookies } from "next/headers";
import { asLang, LANG_COOKIE, messages } from "./index";

/** The patient's language, from the cookie the language switch sets (D62). */
export async function getLang() {
  return asLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT() {
  return messages[await getLang()];
}
