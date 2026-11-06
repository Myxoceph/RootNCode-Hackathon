import type { Lang } from "@vagabonds/contracts";

import { getMessages, localeTag } from "@/i18n";

/** Days since 1 January 1970 in local time: the same number all day, the next one tomorrow. */
export const dayNumber = (date: Date): number => Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);

/** A forecast day's name: "Bugün", "Yarın", then the short weekday ("Paz"). `date` is YYYY-MM-DD, local. */
export function dayLabel(date: string, today: Date, lang: Lang): string {
  const [year, month, day] = date.split("-").map(Number);
  const that = new Date(year!, month! - 1, day!, 12);
  const w = getMessages().welcome;
  const ahead = dayNumber(that) - dayNumber(today);
  if (ahead === 0) return w.today;
  if (ahead === 1) return w.tomorrow;
  const name = that.toLocaleDateString(localeTag(lang), { weekday: "short" });
  return name.charAt(0).toLocaleUpperCase(localeTag(lang)) + name.slice(1);
}
