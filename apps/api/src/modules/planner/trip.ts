import type { DailyForecast, TransitItinerary, TripDuration, TripLegTransit, TripWeatherNoteCode, VisitSetting } from "@vagabonds/contracts";
import type { Point } from "../assets/assets.network.ts";
import { HEAT_THRESHOLD_C } from "../weather/weather.service.ts";
import {
  MAX_LEG_WALK_METERS,
  visitProfile,
  walkMeters,
  walkMinutes,
  type PlannerCandidate,
  type VisitProfile,
} from "./planner.ts";

/** Days start at 09:00 (minutes after local midnight). */
export const DAY_START = 9 * 60;
/** The lunch break comes after the first stop that ends at or after 12:00. */
export const LUNCH_AFTER = 12 * 60;
export const LUNCH_MINUTES = 60;
export const DESSERT_MINUTES = 30;
/** Above this chance of precipitation in the day (but not in the afternoon) the note suggests an umbrella. */
export const RAIN_POSSIBLE_PERCENT = 15;

const FULL_DAY = { endMinute: 17 * 60 + 30, lunch: true, maxStops: 10 };

/**
 * When each day must be over (dessert included), whether it has a lunch break, and how many stops
 * it holds: the visit times are short estimates, so the clock alone packed 24 stops into a day.
 */
export const TRIP_SHAPE: Record<TripDuration, { days: number; endMinute: number; lunch: boolean; maxStops: number }> = {
  half: { days: 1, endMinute: 13 * 60 + 30, lunch: false, maxStops: 4 },
  "1": { days: 1, ...FULL_DAY },
  "2": { days: 2, ...FULL_DAY },
  "3": { days: 3, ...FULL_DAY },
  "4": { days: 4, ...FULL_DAY },
  "5": { days: 5, ...FULL_DAY },
};

export interface ImportanceSignals {
  /** Kentsel Ağ links in either direction. */
  relationCount: number;
  highlightCount: number;
  hasPhoto: boolean;
}

/** Links weigh most: a site many others point to is central to the city's waqf network. */
export function importanceOf({ relationCount, highlightCount, hasPhoto }: ImportanceSignals): number {
  return relationCount * 2 + highlightCount + (hasPhoto ? 1 : 0);
}

export interface TripCandidate extends PlannerCandidate {
  importance: number;
}

export type TripPlanItem =
  | ({ kind: "stop"; id: string; at: number; legMeters: number; legMinutes: number; importance: number } & VisitProfile)
  | { kind: "meal"; meal: "lunch" | "dessert"; at: number; minutes: number };

export interface TripPlanDay {
  items: TripPlanItem[];
  walkMeters: number;
  walkMinutes: number;
  visitMinutes: number;
  outdoorShare: number;
}

export interface TripInput {
  candidates: TripCandidate[];
  /** Where day 1 starts; otherwise each day starts at its most important site. */
  start: Point | null;
  duration: TripDuration;
  /** The forecast for each day of the trip, in order; null where unknown. */
  weather: Array<DailyForecast | null>;
}

export interface TripPlan {
  days: TripPlanDay[];
  skippedWithoutCoordinates: number;
  notPlannedCount: number;
}

type Located = TripCandidate & { point: Point };

const byImportance = (a: Located, b: Located) => b.importance - a.importance || (a.id < b.id ? -1 : 1);

/** Rain in the afternoon or a hot day: open-air sites are better visited in the morning. */
export function prefersMorningOutdoors(weather: DailyForecast | null): boolean {
  return weather !== null && (weather.afternoonRain || weather.highC >= HEAT_THRESHOLD_C);
}

export function weatherNoteCode(weather: DailyForecast | null): TripWeatherNoteCode {
  if (!weather) return "unavailable";
  if (weather.afternoonRain) return "afternoon_rain";
  if (weather.highC >= HEAT_THRESHOLD_C) return "heat";
  if ((weather.precipitationProbability ?? 0) > RAIN_POSSIBLE_PERCENT) return "rain_possible";
  return "clear";
}

/**
 * With afternoon rain or heat, how much farther a site counts when choosing the next
 * stop: indoor sites in the morning and open-air sites in the afternoon wait their turn.
 * A penalty rather than a strict order keeps the walk local.
 */
const TIME_PENALTY: Record<"morning" | "afternoon", Record<VisitSetting, number>> = {
  morning: { outdoor: 1, mixed: 1.5, indoor: 3 },
  afternoon: { outdoor: 3, mixed: 1.5, indoor: 1 },
};

/** Nearest-neighbour order from `from`, aware of the time of day when the weather asks for it. */
function order(sites: Located[], from: Point, outdoorsFirst: boolean): Located[] {
  const left = [...sites];
  const ordered: Located[] = [];
  let here = from;
  let t = DAY_START;
  while (left.length) {
    const penalty = TIME_PENALTY[t < LUNCH_AFTER ? "morning" : "afternoon"];
    let best = 0;
    let bestScore = Infinity;
    left.forEach((site, i) => {
      const meters = walkMeters(here, site.point);
      const score = outdoorsFirst ? meters * penalty[visitProfile(site).setting] + 1 : meters;
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    });
    const [next] = left.splice(best, 1) as [Located];
    t += walkMinutes(walkMeters(here, next.point)) + visitProfile(next).visitMinutes;
    ordered.push(next);
    here = next.point;
  }
  return ordered;
}

/** The site whose walking radius holds the most importance: a day is built around it. */
function richestAnchor(sites: Located[]): Located | null {
  let best: Located | null = null;
  let bestValue = -1;
  for (const a of sites) {
    let value = 0;
    for (const b of sites) if (walkMeters(a.point, b.point) <= MAX_LEG_WALK_METERS) value += b.importance;
    if (value > bestValue) {
      best = a;
      bestValue = value;
    }
  }
  return best;
}

/** The day's timeline for these sites in this order, and the minute it ends (dessert included). */
function timeline(sites: Located[], from: Point | null, lunch: boolean): { items: TripPlanItem[]; end: number } {
  const items: TripPlanItem[] = [];
  let t = DAY_START;
  let here = from;
  let hadLunch = !lunch;
  for (const site of sites) {
    const profile = visitProfile(site);
    const legMeters = here ? walkMeters(here, site.point) : 0;
    const legMinutes = walkMinutes(legMeters);
    const at = t + legMinutes;
    items.push({ kind: "stop", id: site.id, at, legMeters, legMinutes, importance: site.importance, ...profile });
    t = at + profile.visitMinutes;
    here = site.point;
    if (!hadLunch && t >= LUNCH_AFTER) {
      items.push({ kind: "meal", meal: "lunch", at: t, minutes: LUNCH_MINUTES });
      t += LUNCH_MINUTES;
      hadLunch = true;
    }
  }
  if (sites.length) {
    if (!hadLunch) {
      t = Math.max(t, LUNCH_AFTER);
      items.push({ kind: "meal", meal: "lunch", at: t, minutes: LUNCH_MINUTES });
      t += LUNCH_MINUTES;
    }
    items.push({ kind: "meal", meal: "dessert", at: t, minutes: DESSERT_MINUTES });
    t += DESSERT_MINUTES;
  }
  return { items, end: t };
}

function summarize(items: TripPlanItem[]): TripPlanDay {
  let walked = 0;
  let walkTime = 0;
  let visitTime = 0;
  let outdoorTime = 0;
  for (const item of items) {
    if (item.kind !== "stop") continue;
    walked += item.legMeters;
    walkTime += item.legMinutes;
    visitTime += item.visitMinutes;
    outdoorTime += item.visitMinutes * (item.setting === "outdoor" ? 1 : item.setting === "mixed" ? 0.5 : 0);
  }
  return {
    items,
    walkMeters: walked,
    walkMinutes: walkTime,
    visitMinutes: visitTime,
    outdoorShare: visitTime ? Math.round((outdoorTime / visitTime) * 100) / 100 : 0,
  };
}

/**
 * Plans a trip day by day. Each day takes the most important sites still left that are
 * within a walk of the day's anchor (the start point on day 1, else the site whose
 * walking radius holds the most importance) and still fit the day, and walks them
 * nearest-first; on a day with afternoon rain or heat, open-air sites lean to the
 * morning and indoor ones to the afternoon. Lunch follows the first stop that
 * ends after noon; every day with stops ends with a dessert stop.
 */
/** A complex is visited as a whole: its buildings are not stops of their own while it is in the plan. */
export function withoutPartsOfListed<T extends { id: string; parent_id: string | null }>(records: T[]): T[] {
  const ids = new Set(records.map((record) => record.id));
  return records.filter((record) => record.parent_id === null || !ids.has(record.parent_id));
}

/** From this walk on, a leg is worth a bus. */
export const TRANSIT_LEG_METERS = 1_000;
/** A ride that gets there this much later than walking is not an alternative. */
const TRANSIT_MAX_DELAY_MINUTES = 15;

/** The itinerary to offer instead of a walk: a real ride that saves most of the walking, soon enough. */
export function bestLegTransit(
  itineraries: TransitItinerary[],
  { legMeters, departure, legMinutes }: { legMeters: number; departure: Date; legMinutes: number },
): TripLegTransit | null {
  const latest = departure.getTime() + (legMinutes + TRANSIT_MAX_DELAY_MINUTES) * 60_000;
  const useful = itineraries.filter(
    (it) =>
      it.legs.some((leg) => leg.line) && it.walkMeters <= legMeters * 0.6 && new Date(it.arrival).getTime() <= latest,
  );
  const best = useful.sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  if (!best) return null;
  return {
    minutes: best.durationMinutes,
    walkMeters: best.walkMeters,
    rides: best.legs.flatMap((leg) => (leg.line ? [{ line: leg.line.name, from: leg.from.name, to: leg.to.name }] : [])),
  };
}

export function planTrip({ candidates, start, duration, weather }: TripInput): TripPlan {
  const shape = TRIP_SHAPE[duration];
  const located = candidates.filter((c): c is Located => c.point !== null);
  let remaining = [...located].sort(byImportance);
  const days: TripPlanDay[] = [];

  for (let day = 0; day < shape.days; day++) {
    const outdoorsFirst = prefersMorningOutdoors(weather[day] ?? null);
    const from = day === 0 ? start : null;
    const anchor = from ?? richestAnchor(remaining)?.point ?? null;

    let picked: Located[] = [];
    let plan = timeline([], from, shape.lunch);
    if (anchor) {
      for (const site of remaining) {
        if (picked.length === shape.maxStops) break;
        if (walkMeters(anchor, site.point) > MAX_LEG_WALK_METERS) continue;
        const trial = order([...picked, site], anchor, outdoorsFirst);
        const trialPlan = timeline(trial, from, shape.lunch);
        const legsFit = trialPlan.items.every((item) => item.kind !== "stop" || item.legMeters <= MAX_LEG_WALK_METERS);
        if (trialPlan.end <= shape.endMinute && legsFit) {
          picked = trial;
          plan = trialPlan;
        }
      }
    }
    // Out of sites: a five-day trip in a small town ends early rather than with empty days.
    if (picked.length === 0 && day > 0) break;
    const used = new Set(picked.map((site) => site.id));
    remaining = remaining.filter((site) => !used.has(site.id));
    days.push(summarize(plan.items));
  }

  return {
    days,
    skippedWithoutCoordinates: candidates.length - located.length,
    notPlannedCount: remaining.length,
  };
}
