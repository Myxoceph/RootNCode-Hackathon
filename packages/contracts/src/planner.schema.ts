import { z } from "zod";
import { AssetSummarySchema, ContractVersionSchema, LabeledCodeSchema, LangSchema } from "./asset.schema";

/**
 * Vakıf Travel Planner & Hava Durumu (module 4): current weather for a city
 * (`GET /weather`) and a themed walking route (`GET /routes/plan`).
 */

/** Simplified from the WMO weather code. */
export const WeatherConditionSchema = z.enum(["clear", "cloudy", "fog", "rain", "snow", "storm"]);

/** `indoor_preferred` on rain, snow, storm or heat: the route planner then favours indoor sites. */
export const WeatherAdviceSchema = z.enum(["indoor_preferred", "none"]);

export const CurrentWeatherSchema = z.strictObject({
  temperatureC: z.number(),
  precipitationMm: z.number().min(0),
  condition: WeatherConditionSchema,
  /** Raw WMO code, for an icon set that wants more detail than `condition`. */
  weatherCode: z.int().min(0),
  isDay: z.boolean(),
  /** Local observation time as reported by the provider (ISO 8601 without offset). */
  observedAt: z.string().min(1),
});

/** Response body of `GET /weather?city=`. */
export const WeatherResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  city: LabeledCodeSchema,
  /** False when the provider is unreachable or slow; `current` is then null and the app works without weather. */
  available: z.boolean(),
  current: CurrentWeatherSchema.nullable(),
  advice: WeatherAdviceSchema,
  /** Show this credit wherever the weather is displayed (Open-Meteo, CC BY 4.0). */
  attribution: z.string().min(1),
});

export const RouteThemeKindSchema = z.enum(["type", "era", "network"]);

/** Whether a site is visited indoors; `mixed` for complexes with courtyards and gardens. */
export const VisitSettingSchema = z.enum(["indoor", "outdoor", "mixed"]);

export const RouteStopSchema = z.strictObject({
  /** 1-based position in the route. */
  order: z.int().positive(),
  asset: AssetSummarySchema,
  /** Estimated walking distance from the previous stop (or the start); 0 for a route that starts at this asset. */
  legMeters: z.int().min(0),
  legMinutes: z.int().min(0),
  visitMinutes: z.int().positive(),
  /** True when the dataset has no visit duration and a default for the asset type was used. */
  visitMinutesEstimated: z.boolean(),
  setting: VisitSettingSchema,
  /** True when the dataset has no visit setting and it was derived from the asset type. */
  settingEstimated: z.boolean(),
  /** Minutes from the start of the route until arrival at this stop. */
  arrivalMinute: z.int().min(0),
});

/** Response body of `GET /routes/plan`. */
export const RoutePlanResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  city: LabeledCodeSchema,
  theme: z.strictObject({
    kind: RouteThemeKindSchema,
    /** Type or era code, or the asset id whose links (Kentsel Ağ) make up the route. */
    code: z.string().min(1),
  }),
  /** Null only when no matching site has a location (then `stops` is empty). */
  start: z
    .strictObject({
      lat: z.number(),
      lng: z.number(),
      /**
       * `query`: the `start` parameter; `theme_asset`: the asset of a network theme;
       * `densest_asset`: the themed site closest to all others.
       */
      source: z.enum(["query", "theme_asset", "densest_asset"]),
    })
    .nullable(),
  maxMinutes: z.int().positive(),
  /** Weather used for the plan; null when unavailable (the plan then ignores weather). */
  weather: z
    .strictObject({
      condition: WeatherConditionSchema,
      temperatureC: z.number(),
      advice: WeatherAdviceSchema,
    })
    .nullable(),
  stops: z.array(RouteStopSchema),
  totals: z.strictObject({
    walkMeters: z.int().min(0),
    walkMinutes: z.int().min(0),
    visitMinutes: z.int().min(0),
    totalMinutes: z.int().min(0),
  }),
  /** Visible sites matching the theme in this city. */
  candidateCount: z.int().min(0),
  /** Matching sites left out because their location is not known yet. */
  skippedWithoutCoordinates: z.int().min(0),
  /** Located matching sites that did not fit the time budget or the walking limit. */
  notReachedCount: z.int().min(0),
  /** Walking estimates are straight-line distance × 1.3 at 80 m/min, not street routing. */
  estimateNote: z.string().min(1),
});

export type WeatherCondition = z.infer<typeof WeatherConditionSchema>;
export type WeatherAdvice = z.infer<typeof WeatherAdviceSchema>;
export type CurrentWeather = z.infer<typeof CurrentWeatherSchema>;
export type WeatherResponse = z.infer<typeof WeatherResponseSchema>;
export type RouteThemeKind = z.infer<typeof RouteThemeKindSchema>;
export type VisitSetting = z.infer<typeof VisitSettingSchema>;
export type RouteStop = z.infer<typeof RouteStopSchema>;
export type RoutePlanResponse = z.infer<typeof RoutePlanResponseSchema>;
