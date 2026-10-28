import type { DailyForecast, VisitSetting } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";
import type { Point } from "../src/modules/assets/assets.network.ts";
import { walkMeters, walkMinutes } from "../src/modules/planner/planner.ts";
import {
  DAY_START,
  importanceOf,
  LUNCH_AFTER,
  planTrip,
  TRIP_SHAPE,
  weatherNoteCode,
  type TripCandidate,
  type TripPlanDay,
} from "../src/modules/planner/trip.ts";

const ORIGIN: Point = { lat: 40.18, lng: 29.06 };

/** A point `meters` east of ORIGIN (good enough at this scale). */
function east(meters: number): Point {
  return { lat: ORIGIN.lat, lng: ORIGIN.lng + meters / (111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)) };
}

function site(
  id: string,
  meters: number | null,
  { importance = 1, visitMinutes = 30, setting = "indoor" as VisitSetting } = {},
): TripCandidate {
  return { id, point: meters === null ? null : east(meters), typeCode: "cami", visitMinutes, setting, importance };
}

function forecast(overrides: Partial<DailyForecast> = {}): DailyForecast {
  return {
    date: "2026-10-28", highC: 20, lowC: 10, precipitationProbability: 0, condition: "clear", weatherCode: 0,
    afternoonPrecipitationProbability: 0, afternoonRain: false, ...overrides,
  };
}

const stopIds = (day: TripPlanDay | undefined) => (day?.items ?? []).flatMap((i) => (i.kind === "stop" ? [i.id] : []));
const lastEnd = (day: TripPlanDay) => {
  const last = day.items.at(-1);
  return last?.kind === "meal" ? last.at + last.minutes : DAY_START;
};

// Twenty 30-minute sites, 100 m apart: more than any single day can hold.
const street = Array.from({ length: 20 }, (_, i) => site(`s${String(i).padStart(2, "0")}`, i * 100, { importance: i }));

describe("importance", () => {
  it("weighs links most, then highlights, then having a photo", () => {
    expect(importanceOf({ relationCount: 3, highlightCount: 2, hasPhoto: true })).toBe(9);
    expect(importanceOf({ relationCount: 0, highlightCount: 0, hasPhoto: false })).toBe(0);
  });
});

describe("weather note", () => {
  it("names how the weather shapes the day", () => {
    expect(weatherNoteCode(null)).toBe("unavailable");
    expect(weatherNoteCode(forecast({ afternoonRain: true, afternoonPrecipitationProbability: 70 }))).toBe("afternoon_rain");
    expect(weatherNoteCode(forecast({ highC: 34 }))).toBe("heat");
    expect(weatherNoteCode(forecast({ precipitationProbability: 60 }))).toBe("rain_possible");
    expect(weatherNoteCode(forecast())).toBe("clear");
  });
});

describe("planTrip", () => {
  it("fits a half day before 13:30 without a lunch break, ending with dessert", () => {
    const [day] = planTrip({ candidates: street, start: null, duration: "half", weather: [null] }).days;
    expect(day).toBeDefined();
    expect(lastEnd(day as TripPlanDay)).toBeLessThanOrEqual(TRIP_SHAPE.half.endMinute);
    expect(day?.items.some((i) => i.kind === "meal" && i.meal === "lunch")).toBe(false);
    expect(day?.items.at(-1)).toMatchObject({ kind: "meal", meal: "dessert" });
    expect(day?.items[0]).toMatchObject({ kind: "stop", at: DAY_START, legMeters: 0 });
  });

  it("takes the most important sites first", () => {
    const [day] = planTrip({ candidates: street, start: null, duration: "half", weather: [null] }).days;
    const picked = stopIds(day);
    const leftOut = street.filter((s) => !picked.includes(s.id));
    const least = Math.min(...street.filter((s) => picked.includes(s.id)).map((s) => s.importance));
    expect(leftOut.every((s) => s.importance < least)).toBe(true);
  });

  it("puts lunch after the first stop that ends after noon in a full day", () => {
    const [day] = planTrip({ candidates: street, start: null, duration: "1", weather: [null] }).days;
    const items = day?.items ?? [];
    const lunch = items.findIndex((i) => i.kind === "meal" && i.meal === "lunch");
    expect(lunch).toBeGreaterThan(0);
    const before = items[lunch - 1];
    expect(before?.kind === "stop" && before.at + before.visitMinutes).toBeGreaterThanOrEqual(LUNCH_AFTER);
    expect(lastEnd(day as TripPlanDay)).toBeLessThanOrEqual(TRIP_SHAPE["1"].endMinute);
  });

  it("never visits a site twice in a two-day trip and accounts for every candidate", () => {
    const candidates = [...street, site("unknown", null)];
    const plan = planTrip({ candidates, start: null, duration: "2", weather: [null, null] });
    const [first, second] = plan.days.map(stopIds);
    expect(first?.length).toBeGreaterThan(0);
    expect(second?.length).toBeGreaterThan(0);
    expect(first?.filter((id) => second?.includes(id))).toEqual([]);
    expect(plan.skippedWithoutCoordinates).toBe(1);
    expect((first?.length ?? 0) + (second?.length ?? 0) + plan.notPlannedCount + 1).toBe(candidates.length);
  });

  it("moves open-air sites to the morning on a day with afternoon rain", () => {
    // Indoor sites are a little closer; on a dry day the walk takes them first.
    const sites = [
      site("in-1", 30, { importance: 5 }), site("in-2", 40, { importance: 5 }),
      site("out-1", 50, { importance: 5, setting: "outdoor" }), site("out-2", 60, { importance: 5, setting: "outdoor" }),
    ];
    const dry = planTrip({ candidates: sites, start: ORIGIN, duration: "half", weather: [forecast()] });
    expect(stopIds(dry.days[0]).slice(0, 2)).toEqual(["in-1", "in-2"]);

    const rainy = forecast({ afternoonRain: true, afternoonPrecipitationProbability: 80 });
    const wet = planTrip({ candidates: sites, start: ORIGIN, duration: "half", weather: [rainy] });
    expect(stopIds(wet.days[0]).slice(0, 2)).toEqual(["out-1", "out-2"]);
    expect(wet.days[0]?.outdoorShare).toBe(0.5);
  });

  it("walks from the given start point on day 1", () => {
    const [day] = planTrip({ candidates: [site("far", 800)], start: ORIGIN, duration: "half", weather: [null] }).days;
    const legMeters = walkMeters(ORIGIN, east(800));
    expect(day?.items[0]).toMatchObject({ kind: "stop", id: "far", legMeters, at: DAY_START + walkMinutes(legMeters) });
    expect(legMeters).toBeGreaterThan(1000);
  });

  it("returns empty days when nothing is located", () => {
    const plan = planTrip({ candidates: [site("unknown", null)], start: null, duration: "2", weather: [null, null] });
    expect(plan.days).toHaveLength(2);
    expect(plan.days.every((day) => day.items.length === 0 && day.outdoorShare === 0)).toBe(true);
    expect(plan).toMatchObject({ skippedWithoutCoordinates: 1, notPlannedCount: 0 });
  });
});
