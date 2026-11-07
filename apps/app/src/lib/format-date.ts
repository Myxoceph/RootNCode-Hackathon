import { getLang, localeTag } from "@/i18n";
import type { Lang } from "@vagabonds/contracts";

/**
 * "1 Haziran 2025". A date without a time ("2025-06-01") is read as UTC so it never shifts a day
 * west of Greenwich; a moment ("2025-06-01T21:30:00Z") is dated by the day in Türkiye, as the API
 * dates visitor notes in the pulse, so a note shows the same day in both places wherever the visitor is.
 */
export function formatDate(iso: string, lang: Lang = getLang()): string {
  const dateOnly = iso.length === 10;
  return new Date(iso).toLocaleDateString(localeTag(lang), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "Europe/Istanbul",
  });
}
