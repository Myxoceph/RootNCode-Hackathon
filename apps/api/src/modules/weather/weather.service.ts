import type { CurrentWeather, DailyForecast, WeatherAdvice, WeatherCondition } from "@vagabonds/contracts";
import { z } from "zod";
import type { Point } from "../assets/assets.network.ts";

export const WEATHER_ATTRIBUTION = "Hava durumu: Open-Meteo.com (CC BY 4.0)";
/** At or above this temperature the planner prefers indoor sites, as it does in bad weather. */
export const HEAT_THRESHOLD_C = 32;

/** An afternoon (12:00–18:00) hour at or above this chance of precipitation counts as afternoon rain. */
export const AFTERNOON_RAIN_PERCENT = 50;
/** Today and the next two days: enough for a two-day trip that starts tomorrow. */
export const FORECAST_DAYS = 3;

const DEFAULT_TIMEOUT_MS = 2_000;
const DEFAULT_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_FORECAST_TTL_MS = 60 * 60 * 1_000;

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

const nullableNumbers = z.array(z.number().nullable());

/** The part of Open-Meteo's `/v1/forecast?daily=…&hourly=precipitation_probability` response we use. */
const OpenMeteoForecastSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    weather_code: nullableNumbers,
    temperature_2m_max: nullableNumbers,
    temperature_2m_min: nullableNumbers,
    precipitation_probability_max: nullableNumbers,
  }),
  hourly: z.object({
    // Local time, "YYYY-MM-DDTHH:MM"
    time: z.array(z.string()),
    precipitation_probability: nullableNumbers,
  }),
});

type OpenMeteoForecast = z.infer<typeof OpenMeteoForecastSchema>;

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.max(0, Math.min(100, Math.round(value)));

/** Daily forecasts from an Open-Meteo answer; days the provider left incomplete are dropped. */
export function forecastDays({ daily, hourly }: OpenMeteoForecast): DailyForecast[] {
  const days: DailyForecast[] = [];
  daily.time.forEach((date, i) => {
    const code = daily.weather_code[i];
    const high = daily.temperature_2m_max[i];
    const low = daily.temperature_2m_min[i];
    if (code === null || code === undefined || high === null || high === undefined || low === null || low === undefined) return;

    const afternoon = hourly.time
      .map((time, h) => ({ hour: Number(time.slice(11, 13)), day: time.slice(0, 10), p: hourly.precipitation_probability[h] }))
      .filter(({ day, hour, p }) => day === date && hour >= 12 && hour < 18 && p !== null && p !== undefined)
      .map(({ p }) => p as number);
    const afternoonP = afternoon.length ? percent(Math.max(...afternoon)) : null;

    days.push({
      date,
      highC: high,
      lowC: low,
      precipitationProbability: percent(daily.precipitation_probability_max[i]),
      condition: conditionOf(code),
      weatherCode: code,
      afternoonPrecipitationProbability: afternoonP,
      afternoonRain: afternoonP !== null && afternoonP >= AFTERNOON_RAIN_PERCENT,
    });
  });
  return days;
}

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
  /** Today and the next days in local time, or null when the provider fails or is too slow. Never throws. */
  forecast(point: Point): Promise<DailyForecast[] | null>;
}

export interface WeatherServiceOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  ttlMs?: number;
  forecastTtlMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export function createWeatherService({
  baseUrl,
  fetch: fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ttlMs = DEFAULT_TTL_MS,
  forecastTtlMs = DEFAULT_FORECAST_TTL_MS,
  now = Date.now,
  onError = () => {},
}: WeatherServiceOptions): WeatherService {
  /**
   * One cached Open-Meteo `/v1/forecast` call per ~1 km grid cell (nearby points of a city
   * share an entry). Failures are not cached, so the next request tries the provider again.
   */
  function cachedQuery<T>(params: Record<string, string>, ttl: number, read: (body: unknown) => T) {
    const cache = new Map<string, { at: number; value: T }>();
    return async ({ lat, lng }: Point): Promise<T | null> => {
      const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < ttl) return hit.value;

      const url = new URL("/v1/forecast", baseUrl);
      url.searchParams.set("latitude", lat.toFixed(4));
      url.searchParams.set("longitude", lng.toFixed(4));
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
      url.searchParams.set("timezone", "auto");
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
        const value = read(await response.json());
        cache.set(key, { at: now(), value });
        return value;
      } catch (error) {
        onError(error);
        return null;
      }
    };
  }

  const current = cachedQuery({ current: "temperature_2m,precipitation,weather_code,is_day" }, ttlMs, (body) => {
    const { current } = OpenMeteoCurrentSchema.parse(body);
    return {
      temperatureC: current.temperature_2m,
      precipitationMm: Math.max(0, current.precipitation),
      condition: conditionOf(current.weather_code),
      weatherCode: current.weather_code,
      isDay: current.is_day === 1,
      observedAt: current.time,
    } satisfies CurrentWeather;
  });

  const forecast = cachedQuery(
    {
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      hourly: "precipitation_probability",
      forecast_days: String(FORECAST_DAYS),
    },
    forecastTtlMs,
    (body) => forecastDays(OpenMeteoForecastSchema.parse(body)),
  );

  return { current, forecast };
}
