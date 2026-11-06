/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the imported dataset, real
 * routes; the weather provider is a stub so the tests never reach the network.
 * Every response is also parsed with the shared contract.
 */
import "dotenv/config";
import {
  RoutePlanResponseSchema,
  TripPlanResponseSchema,
  WeatherResponseSchema,
  type CurrentWeather,
  type DailyForecast,
  type TripDay,
} from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import type { WeatherService } from "../src/modules/weather/weather.service.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const ULUCAMI = "bursa-osmangazi-ulucami";

const RAIN: CurrentWeather = {
  temperatureC: 14, precipitationMm: 2.5, condition: "rain", weatherCode: 63, isDay: true, observedAt: "2026-10-21T14:00",
};

/** Today in Türkiye, as the trip planner counts days. */
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

function dayAfter(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dry today, rain in the afternoon tomorrow. */
const FORECAST: DailyForecast[] = [0, 1, 2].map((offset) => ({
  date: dayAfter(TODAY, offset),
  highC: 20,
  lowC: 11,
  precipitationProbability: offset === 1 ? 80 : 0,
  condition: offset === 1 ? "rain" : "clear",
  weatherCode: offset === 1 ? 61 : 0,
  afternoonPrecipitationProbability: offset === 1 ? 80 : 0,
  afternoonRain: offset === 1,
}));

describe.skipIf(!DATABASE_URL)("planner routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let current: CurrentWeather | null = null;
  let forecast: DailyForecast[] | null = null;
  const weather: WeatherService = { current: async () => current, forecast: async () => forecast };
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, mediaBaseUrl: "https://media.test", weather });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function get(url: string, status = 200) {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode, response.body).toBe(status);
    return response;
  }

  describe("GET /weather", () => {
    it("reports unavailable weather without failing", async () => {
      current = null;
      const body = WeatherResponseSchema.parse((await get("/weather?city=bursa")).json());
      expect(body).toMatchObject({ available: false, current: null, advice: "none", city: { code: "bursa" } });
    });

    it("returns the provider's current weather with advice", async () => {
      current = RAIN;
      const body = WeatherResponseSchema.parse((await get("/weather?city=hatay&lang=en")).json());
      expect(body).toMatchObject({ available: true, current: RAIN, advice: "indoor_preferred", lang: "en" });
      expect(body.attribution).toContain("Open-Meteo");
    });

    it("adds the daily forecast when there is one", async () => {
      forecast = FORECAST;
      expect(WeatherResponseSchema.parse((await get("/weather?city=bursa")).json()).daily).toEqual(FORECAST);
      forecast = null;
      expect(WeatherResponseSchema.parse((await get("/weather?city=bursa")).json()).daily).toEqual([]);
    });

    it("rejects an unknown city", async () => {
      const response = await get("/weather?city=atlantis", 404);
      expect(response.json().error.code).toBe("CITY_NOT_FOUND");
    });
  });

  describe("GET /routes/plan", () => {
    it("plans a themed walk within the time budget", async () => {
      current = null;
      const body = RoutePlanResponseSchema.parse((await get("/routes/plan?city=bursa&theme=type:cami&maxMinutes=120")).json());
      expect(body.stops.length).toBeGreaterThan(1);
      expect(body.totals.totalMinutes).toBeLessThanOrEqual(120);
      expect(body.start?.source).toBe("densest_asset");
      expect(body.weather).toBeNull();
      for (const stop of body.stops) {
        expect(stop.asset.type.code).toBe("cami");
        expect(stop.asset.city.code).toBe("bursa");
        expect(stop.asset.coordinates).not.toBeNull();
      }
      expect(body.stops.map((s) => s.order)).toEqual(body.stops.map((_, i) => i + 1));
      expect(body.candidateCount).toBe(body.stops.length + body.skippedWithoutCoordinates + body.notReachedCount);
    });

    it("follows the links of an asset for a network theme, starting at that asset", async () => {
      const body = RoutePlanResponseSchema.parse(
        (await get(`/routes/plan?city=bursa&theme=network:${ULUCAMI}&maxMinutes=240`)).json(),
      );
      expect(body.start?.source).toBe("theme_asset");
      expect(body.stops[0]?.asset.id).toBe(ULUCAMI);
      expect(body.stops[0]?.legMeters).toBe(0);
    });

    it("uses the start point and the weather when given", async () => {
      current = RAIN;
      const body = RoutePlanResponseSchema.parse(
        (await get("/routes/plan?city=bursa&theme=type:turbe&start=40.1842,29.0617&maxMinutes=90")).json(),
      );
      expect(body.start).toEqual({ lat: 40.1842, lng: 29.0617, source: "query" });
      expect(body.weather).toEqual({ condition: "rain", temperatureC: 14, advice: "indoor_preferred" });
    });

    it("returns an empty plan when nothing matches", async () => {
      const body = RoutePlanResponseSchema.parse((await get("/routes/plan?city=hatay&theme=type:darussifa")).json());
      expect(body).toMatchObject({ stops: [], candidateCount: 0, start: null });
    });

    it("validates the query", async () => {
      for (const query of ["city=bursa", "city=bursa&theme=color:red", "city=bursa&theme=type:cami&start=1,2", "city=bursa&theme=type:cami&maxMinutes=5"]) {
        expect((await get(`/routes/plan?${query}`, 400)).json().error.code).toBe("INVALID_QUERY");
      }
      expect((await get("/routes/plan?city=atlantis&theme=type:cami", 404)).json().error.code).toBe("CITY_NOT_FOUND");
      expect((await get("/routes/plan?city=bursa&theme=network:bursa-yok-boyle-bir-eser", 404)).json().error.code).toBe("ASSET_NOT_FOUND");
    });
  });

  describe("GET /routes/trip", () => {
    const stops = (day: TripDay | undefined) => (day?.items ?? []).flatMap((i) => (i.kind === "stop" ? [i] : []));

    it("plans a full day from the most important sites, with lunch and dessert", async () => {
      forecast = null;
      const body = TripPlanResponseSchema.parse((await get("/routes/trip?city=bursa")).json());
      expect(body).toMatchObject({ duration: "1", theme: null, city: { code: "bursa" } });
      const [day] = body.days;
      expect(day).toMatchObject({ day: 1, date: TODAY, weather: null, weatherNote: { code: "unavailable" } });
      expect(stops(day).length).toBeGreaterThan(3);
      expect(day?.items.map((i) => i.kind === "meal" && i.meal).filter(Boolean)).toEqual(["lunch", "dessert"]);
      const lunch = day?.items.find((i) => i.kind === "meal" && i.meal === "lunch");
      expect(lunch).toMatchObject({ label: "Öğle molası", dish: { kind: { code: "main" } } });
      const dessert = day?.items.find((i) => i.kind === "meal" && i.meal === "dessert");
      expect(dessert).toMatchObject({ dish: { kind: { code: "dessert" } } });
      const ats = day?.items.map((i) => i.at) ?? [];
      expect(ats).toEqual([...ats].sort((a, b) => a - b));
      expect(Math.max(...stops(day).map((s) => s.importance))).toBeGreaterThan(20);
      expect(body.candidateCount).toBe(stops(day).length + body.skippedWithoutCoordinates + body.notPlannedCount);
      expect(body.attribution).toContain("Open-Meteo");
    });

    it("plans two days without repeating a site, each with its own forecast", async () => {
      forecast = FORECAST;
      const body = TripPlanResponseSchema.parse((await get("/routes/trip?city=bursa&duration=2&lang=en")).json());
      const [first, second] = body.days;
      expect(first).toMatchObject({ date: TODAY, weatherNote: { code: "clear" } });
      expect(second).toMatchObject({ date: dayAfter(TODAY, 1), weatherNote: { code: "afternoon_rain" } });
      expect(second?.weatherNote.text).toContain("80%");
      const firstIds = stops(first).map((s) => s.asset.id);
      expect(stops(second).filter((s) => firstIds.includes(s.asset.id))).toEqual([]);
      expect(second?.items.find((i) => i.kind === "meal")).toMatchObject({ label: "Lunch break" });
      const dishIds = body.days.flatMap((d) => d.items.flatMap((i) => (i.kind === "meal" && i.dish ? [i.dish.id] : [])));
      expect(dishIds).toHaveLength(4);
      expect(new Set(dishIds).size).toBe(4);
    });

    it("plans a trip beyond the forecast without weather, and says why", async () => {
      forecast = FORECAST;
      const first = dayAfter(TODAY, 30);
      const body = TripPlanResponseSchema.parse((await get(`/routes/trip?city=bursa&duration=5&date=${first}`)).json());
      expect(body.days.length).toBeGreaterThan(2);
      expect(body.duration).toBe(String(body.days.length));
      expect(body.days[0]).toMatchObject({ date: first, weather: null, weatherNote: { code: "unavailable" } });
      expect(body.days[0]?.weatherNote.text).toContain("henüz");
      expect(body.days[1]?.date).toBe(dayAfter(TODAY, 31));
      const ids = body.days.flatMap((day) => stops(day).map((stop) => stop.asset.id));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("mixes forecast days and later ones in a trip that reaches past the forecast", async () => {
      forecast = FORECAST;
      const body = TripPlanResponseSchema.parse((await get("/routes/trip?city=bursa&duration=4")).json());
      expect(body.days[1]?.weatherNote.code).toBe("afternoon_rain");
      expect(body.days[3]).toMatchObject({ weather: null, weatherNote: { code: "unavailable" } });
    });

    it("keeps a themed half day to its theme and before 13:30", async () => {
      const body = TripPlanResponseSchema.parse(
        (await get(`/routes/trip?city=bursa&duration=half&theme=type:turbe&date=${dayAfter(TODAY, 1)}`)).json(),
      );
      expect(body.theme).toEqual({ kind: "type", code: "turbe" });
      const [day] = body.days;
      expect(day?.date).toBe(dayAfter(TODAY, 1));
      expect(stops(day).every((s) => s.asset.type.code === "turbe")).toBe(true);
      const last = day?.items.at(-1);
      expect(last?.kind === "meal" && last.at + last.minutes).toBeLessThanOrEqual(13 * 60 + 30);
    });

    it("validates the query", async () => {
      const bad = [
        "city=bursa&duration=6",
        "city=bursa&theme=network:bursa-osmangazi-ulucami",
        "city=bursa&date=2020-01-01",
        `city=bursa&date=${dayAfter(TODAY, 366)}`,
        "city=bursa&start=1,2",
      ];
      for (const query of bad) {
        expect((await get(`/routes/trip?${query}`, 400)).json().error.code).toBe("INVALID_QUERY");
      }
      expect((await get("/routes/trip?city=atlantis", 404)).json().error.code).toBe("CITY_NOT_FOUND");
    });
  });
});
