import type { AssetSummary, MyAchievement, WeatherResponse } from "@vagabonds/contracts";

import { getMessages, type Messages } from "@/i18n";

type Rule = MyAchievement["rule"];
type Unit = keyof Messages["welcome"]["units"];

/** What a badge still asks for, in the words of its rule: eser, ilçe, şehir, yapı, mühür, not… */
function unitOf(rule: Rule): Unit {
  switch (rule.kind) {
    case "visit_count":
      return "asset";
    case "districts":
      return "district";
    case "cities":
      return "city";
    case "within":
      return rule.level === "city" ? "city" : "district";
    case "complex":
      return "building";
    case "proven_visits":
      return "seal";
    case "contributions":
      return rule.contribution === "notes" ? "note" : rule.contribution === "photos" ? "photo" : "contribution";
  }
}

/**
 * The badge the visitor is nearest to: not earned yet, the fewest steps left (the most of the way
 * there on a tie). `null` when every badge is earned or there are none.
 */
export function nearestBadge(items: MyAchievement[]): { title: string; left: number; unit: Unit; current: number; target: number } | null {
  let best: { item: MyAchievement; left: number } | null = null;
  for (const item of items) {
    if (item.earnedAt) continue;
    const left = item.progress.target - item.progress.current;
    if (left <= 0) continue;
    const share = item.progress.current / item.progress.target;
    const bestShare = best ? best.item.progress.current / best.item.progress.target : -1;
    if (!best || left < best.left || (left === best.left && share > bestShare)) best = { item, left };
  }
  return best
    ? { title: best.item.title, left: best.left, unit: unitOf(best.item.rule), current: best.item.progress.current, target: best.item.progress.target }
    : null;
}

/** Days since 1 January 1970 in local time: the same number all day, the next one tomorrow. */
export const dayNumber = (date: Date): number => Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);

/**
 * The greeting's first line, which changes by itself from day to day: on one day the badge the
 * visitor is nearest to, on the next a tip of the app; a tip whenever there is no badge to name.
 */
export type DayLine =
  | { kind: "badge"; text: string; current: number; target: number }
  | { kind: "tip"; text: string };

export function dailyLine(achievements: MyAchievement[] | null, date: Date): DayLine {
  const w = getMessages().welcome;
  const day = dayNumber(date);
  const badge = achievements ? nearestBadge(achievements) : null;
  if (badge && day % 2 === 0) {
    return { kind: "badge", text: w.badge(badge.title, badge.left, w.units[badge.unit](badge.left)), current: badge.current, target: badge.target };
  }
  return { kind: "tip", text: w.tips[Math.floor(day / 2) % w.tips.length]! };
}

/** "gezmek için güzel bir gün": a word on going out in the weather now. `null` without it. */
export function weatherMood(weather: WeatherResponse | null): string | null {
  const now = weather?.available ? weather.current : null;
  if (!now) return null;
  const w = getMessages().welcome.weather;
  const degrees = Math.round(now.temperatureC);
  if (now.condition === "rain" || now.condition === "snow" || now.condition === "storm") return w.indoor[now.condition];
  if (degrees >= 32) return w.hot;
  if (degrees <= 0) return w.cold;
  return now.isDay ? w.out[now.condition] : w.night[now.condition];
}

/** "Bursa'da bugün 14°, gezmek için güzel bir gün.": the city's weather now, in a word on going out. `null` without it. */
export function weatherLine(weather: WeatherResponse | null): string | null {
  const mood = weatherMood(weather);
  if (!weather?.current || mood === null) return null;
  return getMessages().welcome.weather.line(weather.city.label, Math.round(weather.current.temperatureC), mood);
}

/** The site of the day: one with a photo, the same all day, another tomorrow. `null` when none has a photo. */
export function dayAsset(assets: AssetSummary[], date: Date): AssetSummary | null {
  const withPhoto = assets.filter((asset) => asset.cover !== null).sort((a, b) => a.id.localeCompare(b.id));
  if (withPhoto.length === 0) return null;
  return withPhoto[dayNumber(date) % withPhoto.length]!;
}
