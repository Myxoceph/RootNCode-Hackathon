import type { CurrentWeather, WeatherAdvice, WeatherCondition } from "@vagabonds/contracts";
import { z } from "zod";
import type { Point } from "../assets/assets.network.ts";

export const WEATHER_ATTRIBUTION = "Hava durumu: Open-Meteo.com (CC BY 4.0)";
/** At or above this temperature the planner prefers indoor sites, as it does in bad weather. */
export const HEAT_THRESHOLD_C = 32;

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_TTL_MS = 15 * 60 * 1_000;

/** The part of Open-Meteo's `/v1/forecast?current=…` response we use. */
const OpenMeteoCurrentSchema = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    precipitation: z.number(),
    weather_code: z.number().int(),
    is_day: z.number().int(),
  }),
});

/** WMO weather interpretation codes (Open-Meteo docs) → a small set the app has icons for. */
export function conditionOf(code: number): WeatherCondition {
  if (code <= 1) return "clear";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "rain"; // 51–67 drizzle/rain, 80–82 showers
}

export function adviceFor(current: CurrentWeather | null): WeatherAdvice {
  if (!current) return "none";
  const bad = current.condition === "rain" || current.condition === "snow" || current.condition === "storm";
  return bad || current.temperatureC >= HEAT_THRESHOLD_C ? "indoor_preferred" : "none";
}

export interface WeatherService {
  /** Current weather at the point, or null when the provider fails or is too slow. Never throws. */
  current(point: Point): Promise<CurrentWeather | null>;
}

export interface WeatherServiceOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  ttlMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export function createWeatherService({
  baseUrl,
  fetch: fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now,
  onError = () => {},
}: WeatherServiceOptions): WeatherService {
  // Failures are not cached, so the next request tries the provider again.
  const cache = new Map<string, { at: number; value: CurrentWeather }>();

  return {
    async current({ lat, lng }) {
      // ~1 km grid: nearby points of one city share a cache entry
      const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;

      const url = new URL("/v1/forecast", baseUrl);
      url.searchParams.set("latitude", lat.toFixed(4));
      url.searchParams.set("longitude", lng.toFixed(4));
      url.searchParams.set("current", "temperature_2m,precipitation,weather_code,is_day");
      url.searchParams.set("timezone", "auto");
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
        const { current } = OpenMeteoCurrentSchema.parse(await response.json());
        const value: CurrentWeather = {
          temperatureC: current.temperature_2m,
          precipitationMm: Math.max(0, current.precipitation),
          condition: conditionOf(current.weather_code),
          weatherCode: current.weather_code,
          isDay: current.is_day === 1,
          observedAt: current.time,
        };
        cache.set(key, { at: now(), value });
        return value;
      } catch (error) {
        onError(error);
        return null;
      }
    },
  };
}
