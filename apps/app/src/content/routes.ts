/**
 * Route planner rules and the cities it knows. Sample content (see ./README.md):
 * the stops, weather and food are from the Hayrat design, the rules are its
 * prototype rule engine.
 */
import type { Lang } from "@vagabonds/contracts";

import { messages, type Messages } from "@/i18n/messages";

export type RegionKey = "bursa" | "edirne";
export type Region = RegionKey | "both";
export type Duration = "half" | "1" | "2";

export interface Weather {
  day: string;
  high: number;
  low: number;
  sky: string;
  /** Chance of rain, percent. */
  rain: number;
  /** Rain is expected in the afternoon: open-air stops move to the morning. */
  afternoonRain: boolean;
  icon: "cloud" | "sunny";
}

export interface RouteStop {
  name: string;
  /** Higher comes first when the time budget is short. */
  importance: number;
  hours: number;
  /** Share of the visit spent outdoors, 0–1. */
  outdoor: number;
  tag: string;
}

interface CityRoute {
  city: string;
  title: string;
  weather: [Weather, Weather];
  stops: RouteStop[];
  lunch: { name: string; where: string };
  dessert: { name: string; where: string };
}

export const cityRoutes: Record<RegionKey, CityRoute> = {
  bursa: {
    city: "Bursa",
    title: "Bursa Erken Dönem Külliyeler Rotası",
    weather: [
      { day: "12 Eki Pzt", high: 19, low: 11, sky: "Parçalı bulutlu", rain: 40, afternoonRain: true, icon: "cloud" },
      { day: "13 Eki Sal", high: 21, low: 12, sky: "Güneşli", rain: 5, afternoonRain: false, icon: "sunny" },
    ],
    stops: [
      { name: "Ulu Cami", importance: 10, hours: 0.75, outdoor: 0.1, tag: "Cami" },
      { name: "Yeşil Cami ve Yeşil Türbe", importance: 9, hours: 1, outdoor: 0.3, tag: "Cami, türbe" },
      { name: "Koza Han", importance: 8, hours: 0.5, outdoor: 0.85, tag: "Han, açık avlu" },
      { name: "Orhan Gazi Külliyesi ve Emir Han", importance: 8, hours: 0.75, outdoor: 0.5, tag: "Külliye" },
      { name: "Muradiye Külliyesi", importance: 7, hours: 1.5, outdoor: 0.6, tag: "Külliye, türbe bahçesi" },
      { name: "Yıldırım Külliyesi", importance: 6, hours: 0.75, outdoor: 0.4, tag: "Külliye" },
    ],
    lunch: { name: "İskender", where: "Hanlar Bölgesi" },
    dessert: { name: "Kestane şekeri", where: "Koza Han avlusu" },
  },
  edirne: {
    city: "Edirne",
    title: "Edirne Sultan Külliyeleri Rotası",
    weather: [
      { day: "12 Eki Pzt", high: 17, low: 8, sky: "Güneşli", rain: 0, afternoonRain: false, icon: "sunny" },
      { day: "13 Eki Sal", high: 16, low: 9, sky: "Parçalı bulutlu", rain: 20, afternoonRain: false, icon: "cloud" },
    ],
    stops: [
      { name: "Selimiye Camii", importance: 10, hours: 1.25, outdoor: 0.2, tag: "Cami" },
      { name: "II. Bayezid Külliyesi (Sağlık Müzesi)", importance: 9, hours: 1.5, outdoor: 0.5, tag: "Külliye, darüşşifa" },
      { name: "Üç Şerefeli Camii", importance: 8, hours: 0.75, outdoor: 0.3, tag: "Cami" },
      { name: "Eski Cami", importance: 7, hours: 0.5, outdoor: 0.1, tag: "Cami" },
      { name: "Rüstem Paşa Kervansarayı", importance: 6, hours: 0.5, outdoor: 0.7, tag: "Kervansaray, avlu" },
      { name: "Selimiye Arastası", importance: 6, hours: 0.5, outdoor: 0, tag: "Arasta" },
    ],
    lunch: { name: "Tava ciğer", where: "Saraçlar Caddesi" },
    dessert: { name: "Badem ezmesi", where: "Selimiye Arastası" },
  },
};

/** The same two cities' sample content in English: the rules read the same numbers. */
const cityRoutesEn: Record<RegionKey, CityRoute> = {
  bursa: {
    city: "Bursa",
    title: "Bursa's Early Complexes Route",
    weather: [
      { day: "Mon 12 Oct", high: 19, low: 11, sky: "Partly cloudy", rain: 40, afternoonRain: true, icon: "cloud" },
      { day: "Tue 13 Oct", high: 21, low: 12, sky: "Sunny", rain: 5, afternoonRain: false, icon: "sunny" },
    ],
    stops: [
      { name: "Grand Mosque (Ulu Cami)", importance: 10, hours: 0.75, outdoor: 0.1, tag: "Mosque" },
      { name: "Green Mosque and Green Tomb", importance: 9, hours: 1, outdoor: 0.3, tag: "Mosque, tomb" },
      { name: "Koza Han", importance: 8, hours: 0.5, outdoor: 0.85, tag: "Inn, open courtyard" },
      { name: "Orhan Gazi Complex and Emir Han", importance: 8, hours: 0.75, outdoor: 0.5, tag: "Complex" },
      { name: "Muradiye Complex", importance: 7, hours: 1.5, outdoor: 0.6, tag: "Complex, tomb garden" },
      { name: "Yıldırım Complex", importance: 6, hours: 0.75, outdoor: 0.4, tag: "Complex" },
    ],
    lunch: { name: "İskender", where: "Hanlar District" },
    dessert: { name: "Candied chestnuts", where: "Koza Han courtyard" },
  },
  edirne: {
    city: "Edirne",
    title: "Edirne's Sultans' Complexes Route",
    weather: [
      { day: "Mon 12 Oct", high: 17, low: 8, sky: "Sunny", rain: 0, afternoonRain: false, icon: "sunny" },
      { day: "Tue 13 Oct", high: 16, low: 9, sky: "Partly cloudy", rain: 20, afternoonRain: false, icon: "cloud" },
    ],
    stops: [
      { name: "Selimiye Mosque", importance: 10, hours: 1.25, outdoor: 0.2, tag: "Mosque" },
      { name: "Complex of Bayezid II (Health Museum)", importance: 9, hours: 1.5, outdoor: 0.5, tag: "Complex, hospital" },
      { name: "Üç Şerefeli Mosque", importance: 8, hours: 0.75, outdoor: 0.3, tag: "Mosque" },
      { name: "Old Mosque (Eski Cami)", importance: 7, hours: 0.5, outdoor: 0.1, tag: "Mosque" },
      { name: "Rüstem Pasha Caravanserai", importance: 6, hours: 0.5, outdoor: 0.7, tag: "Caravanserai, courtyard" },
      { name: "Selimiye Arasta", importance: 6, hours: 0.5, outdoor: 0, tag: "Arasta" },
    ],
    lunch: { name: "Pan-fried liver", where: "Saraçlar Street" },
    dessert: { name: "Almond paste", where: "Selimiye Arasta" },
  },
};

export type PlanItem =
  | { kind: "stop"; minutes: number; stop: RouteStop }
  | { kind: "food"; minutes: number; label: string; name: string; where: string };

export interface DayPlan {
  city: string;
  weather: Weather;
  items: PlanItem[];
  stops: RouteStop[];
  /** Share of the day spent outdoors, 0–1. */
  outdoorShare: number;
}

export interface RoutePlan {
  title: string;
  /** Set when the choice cannot be planned as asked, e.g. both cities in half a day. */
  notice: string | null;
  days: DayPlan[];
}

const DAY_START = 9 * 60;
const WALK_MINUTES = 15;

function planDay(route: CityRoute, stops: RouteStop[], weather: Weather, budgetHours: number, w: Messages["planner"]): DayPlan {
  let used = 0;
  const picked: RouteStop[] = [];
  for (const stop of [...stops].sort((a, b) => b.importance - a.importance)) {
    if (used + stop.hours + WALK_MINUTES / 60 <= budgetHours) {
      picked.push(stop);
      used += stop.hours + WALK_MINUTES / 60;
    }
  }
  // Rain in the afternoon: the most open-air stops go first.
  if (weather.afternoonRain) picked.sort((a, b) => b.outdoor - a.outdoor);

  const items: PlanItem[] = [];
  let t = DAY_START;
  let hadLunch = budgetHours < 5;
  for (const stop of picked) {
    items.push({ kind: "stop", minutes: t, stop });
    t += Math.round(stop.hours * 60) + WALK_MINUTES;
    if (!hadLunch && t >= 12 * 60) {
      items.push({ kind: "food", minutes: t, label: w.lunch, ...route.lunch });
      t += 60;
      hadLunch = true;
    }
  }
  items.push({ kind: "food", minutes: t, label: w.dessert, ...route.dessert });

  const allHours = picked.reduce((sum, s) => sum + s.hours, 0);
  const outdoorHours = picked.reduce((sum, s) => sum + s.hours * s.outdoor, 0);
  return { city: route.city, weather, items, stops: picked, outdoorShare: allHours ? outdoorHours / allHours : 0 };
}

/** The language is passed in, so a compiled screen plans again when it changes. */
export function planRoute(region: Region, duration: Duration, lang: Lang): RoutePlan {
  const budget = duration === "half" ? 4.5 : 7.5;
  const routes = lang === "en" ? cityRoutesEn : cityRoutes;
  const w = messages[lang].planner;
  const bursa = routes.bursa;
  const edirne = routes.edirne;

  if (region === "both") {
    if (duration !== "2") {
      return {
        title: bursa.title,
        notice: w.bothNotice,
        days: [planDay(bursa, bursa.stops, bursa.weather[0], budget, w)],
      };
    }
    return {
      title: w.bothTitle,
      notice: null,
      days: [planDay(bursa, bursa.stops, bursa.weather[0], budget, w), planDay(edirne, edirne.stops, edirne.weather[1], budget, w)],
    };
  }

  const route = routes[region];
  if (duration === "2") {
    const sorted = [...route.stops].sort((a, b) => b.importance - a.importance);
    const half = Math.ceil(sorted.length / 2);
    return {
      title: route.title,
      notice: null,
      days: [
        planDay(route, sorted.slice(0, half), route.weather[0], budget, w),
        planDay(route, sorted.slice(half), route.weather[1], budget, w),
      ],
    };
  }
  return { title: route.title, notice: null, days: [planDay(route, route.stops, route.weather[0], budget, w)] };
}

/** One sentence on how the weather shaped the day. */
export function weatherAdvice(day: DayPlan, words: Messages["planner"]): string {
  const w = day.weather;
  if (w.afternoonRain) {
    const open = day.stops.filter((s) => s.outdoor >= 0.5).map((s) => s.name.split(" ").slice(0, 2).join(" "));
    return words.rainAdvice(w.rain, open.join(", "));
  }
  if (w.rain > 15) return words.lightRainAdvice(w.rain);
  return words.clearAdvice;
}

export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
