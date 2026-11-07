import type { Lang } from "@vagabonds/contracts";

import { getLang, useLang } from "./lang";
import { messages, type Messages } from "./messages";

export { deviceLang, getLang, setLang, useLang, useLangSettled } from "./lang";
export type { Messages } from "./messages";

/** The interface's words in the app's language; the screen follows a change at once. */
export function useMessages(): Messages {
  return messages[useLang()];
}

/** The same outside React (the data layer, announcements from plain functions). */
export function getMessages(): Messages {
  return messages[getLang()];
}

/** The language as a locale, for dates, numbers and the phone's voice. */
export function localeTag(lang: Lang = getLang()): "tr-TR" | "en-US" {
  return lang === "en" ? "en-US" : "tr-TR";
}
