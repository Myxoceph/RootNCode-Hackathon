import { z } from "zod";
import { AssetSummarySchema, ContractVersionSchema, LabeledCodeSchema, LangSchema } from "./asset.schema";
import { TransitEntryPointCodeSchema, TransitPlanResponseSchema } from "./transit.schema";
import { CityDishSchema } from "./gastronomy.schema";

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
  /** Visible sites matching the theme in this city; a complex counts once, without its buildings. */
  candidateCount: z.int().min(0),
  /** Matching sites left out because their location is not known yet. */
  skippedWithoutCoordinates: z.int().min(0),
  /** Located matching sites that did not fit the time budget or the walking limit. */
  notReachedCount: z.int().min(0),
  /** Walking estimates are straight-line distance × 1.3 at 80 m/min, not street routing. */
  estimateNote: z.string().min(1),
});

/** `half`: 09:00–13:30, 4 stops; `1`: 09:00–17:30, 10 stops, a lunch break; `2` to `5`: that many such days, no site twice. */
export const TripDurationSchema = z.enum(["half", "1", "2", "3", "4", "5"]);

/** How the weather shaped a day of the trip; `text` says it in the response language. */
export const TripWeatherNoteCodeSchema = z.enum(["afternoon_rain", "heat", "rain_possible", "clear", "unavailable"]);

/** A bus or tram instead of walking a long leg; only where public transport is planned (Konya). */
export const TripLegTransitSchema = z.strictObject({
  /** Departure to arrival, walking to and from the stops included. */
  minutes: z.int().min(0),
  /** What is still walked. */
  walkMeters: z.int().min(0),
  rides: z.array(z.strictObject({ line: z.string().min(1), from: z.string().min(1), to: z.string().min(1) })).min(1),
});

/** How to reach the first stop from where the visitor arrives in the city (Konya pilot). */
export const TripArrivalSchema = z.strictObject({
  from: z.strictObject({ code: TransitEntryPointCodeSchema, name: z.string().min(1) }),
  /** The name of day 1's first stop. */
  to: z.string().min(1),
  /** Estimated walk; the ride, when there is one, is the way to go. */
  meters: z.int().min(0),
  transit: TripLegTransitSchema.nullable(),
});

export const TripStopItemSchema = z.strictObject({
  kind: z.literal("stop"),
  /** Arrival, minutes after local midnight (540 = 09:00). */
  at: z.int().min(0),
  asset: AssetSummarySchema,
  /** Estimated walk from the previous stop or meal; 0 for the first stop of a day. */
  legMeters: z.int().min(0),
  legMinutes: z.int().min(0),
  /** The other way to take this leg when it is long; the times above stay those of walking. The default keeps trips saved before 0.3.31 valid. */
  transit: TripLegTransitSchema.nullable().default(null),
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
  /** A local dish for this break (a `main` for lunch, a `dessert` for dessert); null when the city has none. */
  dish: CityDishSchema.nullable(),
});

export const TripItemSchema = z.discriminatedUnion("kind", [TripStopItemSchema, TripMealItemSchema]);

export const TripDaySchema = z.strictObject({
  /** 1-based. */
  day: z.int().positive(),
  date: z.iso.date(),
  /** Null when the forecast is unavailable or the day is too far ahead; the day is then planned without weather. */
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
  /** The days actually planned: less than asked for when the city runs out of sites. */
  duration: TripDurationSchema,
  /** Set when the visitor said how they arrive. The default keeps trips saved before 0.3.32 valid. */
  arrival: TripArrivalSchema.nullable().default(null),
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

/** The app's own id of a saved route; the app makes it, so saving needs no round trip first. */
export const SavedRouteIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/, "must be a short lowercase id");

const savedRouteFields = {
  id: SavedRouteIdSchema,
  title: z.string().trim().min(1).max(120),
  /** How many assets it visits. */
  stops: z.int().min(0).max(500),
};

/**
 * What a kept Rehber answer was asked about: the route planned earlier in the conversation (its
 * `key` names the saved route) or the asset whose page it was asked from.
 */
export const SavedAnswerAboutSchema = z.strictObject({
  kind: z.enum(["route", "asset"]),
  key: z.string().min(1).max(300),
  title: z.string().min(1).max(120),
});

const savedAnswerFields = {
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(10_000),
  about: SavedAnswerAboutSchema.nullable().default(null),
};

/**
 * What the user kept (Profil · Kaydettiklerim), saved to their account so it follows them to every
 * device: a route built in the planner, a trip Rehber planned, or Rehber's food suggestion or
 * transport directions, each kept as it was given.
 */
export const SavedRouteSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("planner"),
    ...savedRouteFields,
    region: z.enum(["bursa", "edirne", "both"]),
    duration: z.enum(["half", "1", "2"]),
    /** The food stops added to it. */
    dishes: z.array(z.string().min(1).max(100)).max(50),
    savedAt: z.iso.datetime(),
  }),
  z.strictObject({
    kind: z.literal("trip"),
    ...savedRouteFields,
    trip: TripPlanResponseSchema,
    savedAt: z.iso.datetime(),
  }),
  /** Rehber's food suggestion: what was asked, the answer without its markers and the dishes it names. */
  z.strictObject({
    kind: z.literal("food"),
    id: SavedRouteIdSchema,
    title: savedRouteFields.title,
    question: savedAnswerFields.question,
    answer: savedAnswerFields.answer,
    about: savedAnswerFields.about,
    dishes: z.array(z.strictObject({ id: z.string().min(1), title: z.string().min(1) })).min(1).max(50),
    savedAt: z.iso.datetime(),
  }),
  /** Rehber's public transport directions, as they were given. */
  z.strictObject({
    kind: z.literal("transit"),
    id: SavedRouteIdSchema,
    title: savedRouteFields.title,
    question: savedAnswerFields.question,
    answer: savedAnswerFields.answer,
    about: savedAnswerFields.about,
    transit: TransitPlanResponseSchema,
    savedAt: z.iso.datetime(),
  }),
]);

/**
 * `POST /me/routes`: keeps a route. `key` names the plan ("the same plan twice is one route"): a
 * route with the same key replaces the one before, on any device. The API sets `savedAt`.
 */
export const SaveRouteRequestSchema = z.strictObject({
  key: z.string().min(1).max(300),
  route: z.discriminatedUnion("kind", [
    SavedRouteSchema.options[0].omit({ savedAt: true }),
    SavedRouteSchema.options[1].omit({ savedAt: true }),
    SavedRouteSchema.options[2].omit({ savedAt: true }),
    SavedRouteSchema.options[3].omit({ savedAt: true }),
  ]),
});

/** `GET /me/routes`: the user's routes, last saved first; at most `SAVED_ROUTES_KEPT`. */
export const SavedRoutesResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  items: z.array(SavedRouteSchema),
});

/** Routes kept per user; saving one more drops the oldest. */
export const SAVED_ROUTES_KEPT = 100;

export type WeatherCondition = z.infer<typeof WeatherConditionSchema>;
export type DailyForecast = z.infer<typeof DailyForecastSchema>;
export type TripDuration = z.infer<typeof TripDurationSchema>;
export type TripWeatherNoteCode = z.infer<typeof TripWeatherNoteCodeSchema>;
export type TripItem = z.infer<typeof TripItemSchema>;
export type TripDay = z.infer<typeof TripDaySchema>;
export type TripLegTransit = z.infer<typeof TripLegTransitSchema>;
export type TripArrival = z.infer<typeof TripArrivalSchema>;
export type TripPlanResponse = z.infer<typeof TripPlanResponseSchema>;
export type WeatherAdvice = z.infer<typeof WeatherAdviceSchema>;
export type CurrentWeather = z.infer<typeof CurrentWeatherSchema>;
export type WeatherResponse = z.infer<typeof WeatherResponseSchema>;
export type RouteThemeKind = z.infer<typeof RouteThemeKindSchema>;
export type VisitSetting = z.infer<typeof VisitSettingSchema>;
export type RouteStop = z.infer<typeof RouteStopSchema>;
export type RoutePlanResponse = z.infer<typeof RoutePlanResponseSchema>;
export type SavedAnswerAbout = z.infer<typeof SavedAnswerAboutSchema>;
export type SavedRoute = z.infer<typeof SavedRouteSchema>;
export type SaveRouteRequest = z.infer<typeof SaveRouteRequestSchema>;
export type SavedRoutesResponse = z.infer<typeof SavedRoutesResponseSchema>;
