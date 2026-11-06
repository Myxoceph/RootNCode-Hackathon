import type { Lang, WeatherResponse } from "@vagabonds/contracts";

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

export type Outing = "good" | "fair" | "poor";
export type OutingReason = keyof ReturnType<typeof getMessages>["welcome"]["outing"]["reasons"];

/**
 * Whether it is a day to go out and see the sites, and why: storms keep the visitor in; rain, snow,
 * fog, a hard frost, great heat or rain on the way call for care; else it is a good day (an evening
 * walk after dark). `null` without the weather.
 */
export function outing(weather: WeatherResponse | null): { level: Outing; reason: OutingReason } | null {
  const now = weather?.available ? weather.current : null;
  if (!weather || !now) return null;
  const degrees = Math.round(now.temperatureC);
  const rainLater = weather.daily[0]?.precipitationProbability ?? 0;
  if (now.condition === "storm") return { level: "poor", reason: "storm" };
  if (degrees <= -5) return { level: "poor", reason: "frost" };
  if (degrees >= 36) return { level: "poor", reason: "scorching" };
  if (now.condition === "rain") return { level: "fair", reason: "rain" };
  if (now.condition === "snow") return { level: "fair", reason: "snow" };
  if (degrees >= 32) return { level: "fair", reason: "hot" };
  if (degrees <= 3) return { level: "fair", reason: "cold" };
  if (now.condition === "fog") return { level: "fair", reason: "fog" };
  if (rainLater >= 60) return { level: "fair", reason: "rainLater" };
  if (!now.isDay) return { level: "good", reason: "evening" };
  if (now.condition === "clear" && degrees >= 15 && degrees <= 28) return { level: "good", reason: "perfect" };
  return { level: "good", reason: now.condition === "cloudy" ? "cloudy" : "fine" };
}
