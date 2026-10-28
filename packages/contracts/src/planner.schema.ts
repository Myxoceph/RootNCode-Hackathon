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

/** One day of the forecast, in the city's local time. */
export const DailyForecastSchema = z.strictObject({
  /** Local date, YYYY-MM-DD. */
  date: z.iso.date(),
  highC: z.number(),
  lowC: z.number(),
  /** Highest hourly chance of precipitation that day, percent; null when the provider has none. */
  precipitationProbability: z.int().min(0).max(100).nullable(),
  condition: WeatherConditionSchema,
  weatherCode: z.int().min(0),
  /** Highest chance of precipitation between 12:00 and 18:00, percent; null when unknown. */
  afternoonPrecipitationProbability: z.int().min(0).max(100).nullable(),
  /** `afternoonPrecipitationProbability` is 50 or more: the trip planner moves open-air stops to the morning. */
  afternoonRain: z.boolean(),
});

/** Response body of `GET /weather?city=`. */
export const WeatherResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  city: LabeledCodeSchema,
  /** False when the provider is unreachable or slow; `current` is then null and the app works without weather. */
  available: z.boolean(),
  current: CurrentWeatherSchema.nullable(),
  /** Today and the next two days; empty when the forecast is unavailable. */
  daily: z.array(DailyForecastSchema),
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

/** `half`: 09:00–13:30; `1`: 09:00–17:30 with a lunch break; `2`: two such days, no site twice. */
export const TripDurationSchema = z.enum(["half", "1", "2"]);

/** How the weather shaped a day of the trip; `text` says it in the response language. */
export const TripWeatherNoteCodeSchema = z.enum(["afternoon_rain", "heat", "rain_possible", "clear", "unavailable"]);

export const TripStopItemSchema = z.strictObject({
  kind: z.literal("stop"),
  /** Arrival, minutes after local midnight (540 = 09:00). */
  at: z.int().min(0),
  asset: AssetSummarySchema,
  /** Estimated walk from the previous stop or meal; 0 for the first stop of a day. */
  legMeters: z.int().min(0),
  legMinutes: z.int().min(0),
  visitMinutes: z.int().positive(),
  visitMinutesEstimated: z.boolean(),
  setting: VisitSettingSchema,
  settingEstimated: z.boolean(),
  /** Why the site was chosen first: Kentsel Ağ links × 2 + highlights + 1 with a photo. */
  importance: z.int().min(0),
});

export const TripMealItemSchema = z.strictObject({
  kind: z.literal("meal"),
  at: z.int().min(0),
  meal: z.enum(["lunch", "dessert"]),
  /** "Öğle molası" / "Tatlı durağı" in the response language. */
  label: z.string().min(1),
  minutes: z.int().positive(),
  /** The city's dish for this break; null until the gastronomy data is in. */
  dish: z.null(),
});

export const TripItemSchema = z.discriminatedUnion("kind", [TripStopItemSchema, TripMealItemSchema]);

export const TripDaySchema = z.strictObject({
  /** 1-based. */
  day: z.int().positive(),
  date: z.iso.date(),
  /** Null when the forecast is unavailable; the day is then planned without weather. */
  weather: DailyForecastSchema.nullable(),
  weatherNote: z.strictObject({ code: TripWeatherNoteCodeSchema, text: z.string().min(1) }),
  /** Stops and meals in time order. Empty when nothing is left to visit. */
  items: z.array(TripItemSchema),
  /** Share of the visiting time spent outdoors (mixed counts half), 0–1. */
  outdoorShare: z.number().min(0).max(1),
  totals: z.strictObject({
    walkMeters: z.int().min(0),
    walkMinutes: z.int().min(0),
    visitMinutes: z.int().min(0),
  }),
});

/** Response body of `GET /routes/trip`. */
export const TripPlanResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  city: LabeledCodeSchema,
  /** Null when the trip covers every type of site. */
  theme: z.strictObject({ kind: z.enum(["type", "era"]), code: z.string().min(1) }).nullable(),
  duration: TripDurationSchema,
  days: z.array(TripDaySchema).min(1),
  /** Visible sites matching the theme in this city. */
  candidateCount: z.int().min(0),
  /** Matching sites left out because their location is not known yet. */
  skippedWithoutCoordinates: z.int().min(0),
  /** Located matching sites that did not fit the days. */
  notPlannedCount: z.int().min(0),
  estimateNote: z.string().min(1),
  /** Show this credit with the forecast (Open-Meteo, CC BY 4.0). */
  attribution: z.string().min(1),
});

export type WeatherCondition = z.infer<typeof WeatherConditionSchema>;
export type DailyForecast = z.infer<typeof DailyForecastSchema>;
export type TripDuration = z.infer<typeof TripDurationSchema>;
export type TripWeatherNoteCode = z.infer<typeof TripWeatherNoteCodeSchema>;
export type TripItem = z.infer<typeof TripItemSchema>;
export type TripDay = z.infer<typeof TripDaySchema>;
export type TripPlanResponse = z.infer<typeof TripPlanResponseSchema>;
export type WeatherAdvice = z.infer<typeof WeatherAdviceSchema>;
export type CurrentWeather = z.infer<typeof CurrentWeatherSchema>;
export type WeatherResponse = z.infer<typeof WeatherResponseSchema>;
export type RouteThemeKind = z.infer<typeof RouteThemeKindSchema>;
export type VisitSetting = z.infer<typeof VisitSettingSchema>;
export type RouteStop = z.infer<typeof RouteStopSchema>;
export type RoutePlanResponse = z.infer<typeof RoutePlanResponseSchema>;
