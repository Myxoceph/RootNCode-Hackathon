import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Point } from "../src/modules/assets/assets.network.ts";
import {
  DEFAULT_SETTING,
  DEFAULT_VISIT_MINUTES,
  MAX_LEG_WALK_METERS,
  planRoute,
  visitProfile,
  walkMeters,
  walkMinutes,
  type PlannerCandidate,
} from "../src/modules/planner/planner.ts";
import { adviceFor, conditionOf, createWeatherService, forecastDays } from "../src/modules/weather/weather.service.ts";

const ORIGIN: Point = { lat: 40.18, lng: 29.06 };

/** A point `meters` east of ORIGIN (good enough at this scale). */
function east(meters: number): Point {
  return { lat: ORIGIN.lat, lng: ORIGIN.lng + meters / (111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)) };
}

function site(id: string, point: Point | null, typeCode = "cami", extra: Partial<PlannerCandidate> = {}): PlannerCandidate {
  return { id, point, typeCode, visitMinutes: null, setting: null, ...extra };
}

describe("visitProfile", () => {
  it("uses dataset values when present", () => {
    expect(visitProfile({ typeCode: "cami", visitMinutes: 35, setting: "mixed" })).toEqual({
      visitMinutes: 35, visitMinutesEstimated: false, setting: "mixed", settingEstimated: false,
    });
  });

  it("falls back to per-type defaults, marked as estimates", () => {
    expect(visitProfile({ typeCode: "cesme", visitMinutes: null, setting: null })).toEqual({
      visitMinutes: 5, visitMinutesEstimated: true, setting: "outdoor", settingEstimated: true,
    });
    expect(visitProfile({ typeCode: "unknown-type", visitMinutes: null, setting: null })).toMatchObject({
      visitMinutes: 10, setting: "mixed",
    });
  });

  it("has defaults for every asset type in data/enums.json except diger", () => {
    const enums = JSON.parse(readFileSync(new URL("../../../data/enums.json", import.meta.url), "utf8")) as {
      asset_types: Array<{ code: string }>;
    };
    const missing = enums.asset_types
      .map(({ code }) => code)
      .filter((code) => code !== "diger" && (!(code in DEFAULT_VISIT_MINUTES) || !(code in DEFAULT_SETTING)));
    expect(missing).toEqual([]);
  });
});

describe("walking estimates", () => {
  it("adds the detour factor and rounds minutes up", () => {
    const meters = walkMeters(ORIGIN, east(1_000));
    expect(meters).toBeGreaterThan(1_290);
    expect(meters).toBeLessThan(1_310);
    expect(walkMinutes(81)).toBe(2);
    expect(walkMinutes(0)).toBe(0);
  });
});

describe("planRoute", () => {
  it("walks nearest-first from the start point", () => {
    const plan = planRoute({
      candidates: [site("far", east(900)), site("near", east(100)), site("mid", east(500))],
      start: ORIGIN,
      maxMinutes: 300,
      preferIndoor: false,
    });
    expect(plan.stops.map((s) => s.id)).toEqual(["near", "mid", "far"]);
    expect(plan.start).toMatchObject({ source: "query" });
    expect(plan.stops[0]).toMatchObject({ arrivalMinute: plan.stops[0]?.legMinutes, visitMinutes: 20 });
    // arrival = previous arrival + its visit + this leg
    const [a, b] = plan.stops;
    expect(b?.arrivalMinute).toBe((a?.arrivalMinute ?? 0) + (a?.visitMinutes ?? 0) + (b?.legMinutes ?? 0));
    expect(plan.walkMeters).toBe(plan.stops.reduce((sum, s) => sum + s.legMeters, 0));
  });

  it("stops when the time budget is used up and counts the rest", () => {
    const plan = planRoute({
      candidates: [site("a", east(100)), site("b", east(200)), site("c", east(300))],
      start: ORIGIN,
      maxMinutes: 45, // two mosques (2 × 20 min) plus short walks
      preferIndoor: false,
    });
    expect(plan.stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(plan.notReachedCount).toBe(1);
    expect(plan.walkMinutes + plan.visitMinutes).toBeLessThanOrEqual(45);
  });

  it("does not offer a leg longer than the walking limit", () => {
    const plan = planRoute({
      candidates: [site("near", east(100)), site("other-town", east(MAX_LEG_WALK_METERS))],
      start: ORIGIN,
      maxMinutes: 600,
      preferIndoor: false,
    });
    expect(plan.stops.map((s) => s.id)).toEqual(["near"]);
    expect(plan.notReachedCount).toBe(1);
  });

  it("skips and counts sites without coordinates", () => {
    const plan = planRoute({
      candidates: [site("located", east(100)), site("unknown", null), site("unknown-2", null)],
      start: ORIGIN,
      maxMinutes: 120,
      preferIndoor: false,
    });
    expect(plan.stops.map((s) => s.id)).toEqual(["located"]);
    expect(plan.skippedWithoutCoordinates).toBe(2);
  });

  it("prefers indoor sites in bad weather", () => {
    const candidates = [site("fountain", east(100), "cesme"), site("mosque", east(250), "cami")];
    const fair = planRoute({ candidates, start: ORIGIN, maxMinutes: 300, preferIndoor: false });
    const rainy = planRoute({ candidates, start: ORIGIN, maxMinutes: 300, preferIndoor: true });
    expect(fair.stops.map((s) => s.id)).toEqual(["fountain", "mosque"]);
    expect(rainy.stops.map((s) => s.id)).toEqual(["mosque", "fountain"]);
  });

  it("without a start point begins at the theme asset, else at the densest site", () => {
    const candidates = [site("edge", east(2_000)), site("centre", east(1_000)), site("left", east(900)), site("right", east(1_100))];
    const dense = planRoute({ candidates, start: null, maxMinutes: 300, preferIndoor: false });
    expect(dense.start).toMatchObject({ source: "densest_asset" });
    expect(dense.stops[0]).toMatchObject({ id: "centre", legMeters: 0 });

    const themed = planRoute({ candidates, start: null, firstId: "edge", maxMinutes: 300, preferIndoor: false });
    expect(themed.start).toMatchObject({ source: "theme_asset" });
    expect(themed.stops[0]?.id).toBe("edge");
  });

  it("returns an empty plan when nothing is located", () => {
    const plan = planRoute({ candidates: [site("a", null)], start: null, maxMinutes: 60, preferIndoor: false });
    expect(plan).toMatchObject({ start: null, stops: [], skippedWithoutCoordinates: 1, notReachedCount: 0 });
  });
});

describe("weather", () => {
  it("maps WMO codes to conditions", () => {
    expect([0, 1, 2, 3, 45, 61, 81, 73, 95].map(conditionOf)).toEqual([
      "clear", "clear", "cloudy", "cloudy", "fog", "rain", "rain", "snow", "storm",
    ]);
  });

  it("advises indoor sites on rain or heat", () => {
    const base = { precipitationMm: 0, weatherCode: 0, isDay: true, observedAt: "2026-10-21T12:00" };
    expect(adviceFor({ ...base, temperatureC: 20, condition: "clear" })).toBe("none");
    expect(adviceFor({ ...base, temperatureC: 20, condition: "rain" })).toBe("indoor_preferred");
    expect(adviceFor({ ...base, temperatureC: 33, condition: "clear" })).toBe("indoor_preferred");
    expect(adviceFor(null)).toBe("none");
  });

  const openMeteoBody = {
    current: { time: "2026-10-21T14:00", temperature_2m: 21.5, precipitation: 0.4, weather_code: 61, is_day: 1 },
  };

  it("parses Open-Meteo and caches the result", async () => {
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(JSON.stringify(openMeteoBody)));
    let clock = 0;
    const service = createWeatherService({ baseUrl: "https://weather.test", fetch, now: () => clock, ttlMs: 1_000 });

    expect(await service.current(ORIGIN)).toEqual({
      temperatureC: 21.5, precipitationMm: 0.4, condition: "rain", weatherCode: 61, isDay: true, observedAt: "2026-10-21T14:00",
    });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://weather.test/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("40.1800");

    await service.current(ORIGIN);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock = 1_001;
    await service.current(ORIGIN);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns null instead of throwing when the provider fails or is slow", async () => {
    const onError = vi.fn();
    const failing = createWeatherService({
      baseUrl: "https://weather.test",
      fetch: async () => new Response("down", { status: 503 }),
      onError,
    });
    expect(await failing.current(ORIGIN)).toBeNull();
    expect(onError).toHaveBeenCalledOnce();

    const slow = createWeatherService({
      baseUrl: "https://weather.test",
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    });
    expect(await slow.current(ORIGIN)).toBeNull();

    const malformed = createWeatherService({ baseUrl: "https://weather.test", fetch: async () => new Response("{}") });
    expect(await malformed.current(ORIGIN)).toBeNull();
  });

  const hours = (date: string, probabilities: Array<number | null>) => ({
    time: probabilities.map((_, h) => `${date}T${String(h).padStart(2, "0")}:00`),
    precipitation_probability: probabilities,
  });
  // Rain at 06:00 and 70% at 15:00 on the first day; 10% all day on the second.
  const day1 = hours("2026-10-28", Array.from({ length: 24 }, (_, h) => (h === 15 ? 70 : h === 6 ? 90 : 0)));
  const day2 = hours("2026-10-29", Array.from({ length: 24 }, () => 10));
  const forecastBody = {
    daily: {
      time: ["2026-10-28", "2026-10-29", "2026-10-30"],
      weather_code: [61, 2, null],
      temperature_2m_max: [17.4, 21, 19],
      temperature_2m_min: [10.3, 12, 11],
      precipitation_probability_max: [90, 10, 5],
    },
    hourly: {
      time: [...day1.time, ...day2.time],
      precipitation_probability: [...day1.precipitation_probability, ...day2.precipitation_probability],
    },
  };

  it("reads the daily forecast and the afternoon chance of rain", () => {
    // The third day has no weather code and is dropped.
    expect(forecastDays(forecastBody)).toEqual([
      {
        date: "2026-10-28", highC: 17.4, lowC: 10.3, precipitationProbability: 90, condition: "rain", weatherCode: 61,
        afternoonPrecipitationProbability: 70, afternoonRain: true,
      },
      {
        date: "2026-10-29", highC: 21, lowC: 12, precipitationProbability: 10, condition: "cloudy", weatherCode: 2,
        afternoonPrecipitationProbability: 10, afternoonRain: false,
      },
    ]);
  });

  it("fetches the forecast once per hour and never throws", async () => {
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(JSON.stringify(forecastBody)));
    let clock = 0;
    const service = createWeatherService({ baseUrl: "https://weather.test", fetch, now: () => clock, forecastTtlMs: 1_000 });

    expect(await service.forecast(ORIGIN)).toHaveLength(2);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("hourly")).toBe("precipitation_probability");
    expect(url.searchParams.get("forecast_days")).toBe("7");
    await service.forecast(ORIGIN);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock = 1_001;
    await service.forecast(ORIGIN);
    expect(fetch).toHaveBeenCalledTimes(2);

    const failing = createWeatherService({
      baseUrl: "https://weather.test",
      fetch: async () => new Response("down", { status: 503 }),
    });
    expect(await failing.forecast(ORIGIN)).toBeNull();
  });
});
