/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the imported dataset, real
 * routes; the weather provider is a stub so the tests never reach the network.
 * Every response is also parsed with the shared contract.
 */
import "dotenv/config";
import { RoutePlanResponseSchema, WeatherResponseSchema, type CurrentWeather } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import type { WeatherService } from "../src/modules/weather/weather.service.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const ULUCAMI = "bursa-osmangazi-ulucami";

const RAIN: CurrentWeather = {
  temperatureC: 14, precipitationMm: 2.5, condition: "rain", weatherCode: 63, isDay: true, observedAt: "2026-10-21T14:00",
};

describe.skipIf(!DATABASE_URL)("planner routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let current: CurrentWeather | null = null;
  const weather: WeatherService = { current: async () => current };
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
});
