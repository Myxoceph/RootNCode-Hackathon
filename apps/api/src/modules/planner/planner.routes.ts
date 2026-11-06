import {
  AssetIdSchema,
  CONTRACT_VERSION,
  LangSchema,
  RoutePlanResponseSchema,
  TripDurationSchema,
  TripPlanResponseSchema,
  VisitSettingSchema,
  WeatherResponseSchema,
  type DailyForecast,
  type Lang,
  type RoutePlanResponse,
  type TripPlanResponse,
  type TripWeatherNoteCode,
  type WeatherResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { toAssetSummary } from "../assets/assets.mapper.ts";
import { visibleStatuses, type AssetsRepository, type AssetVisibility } from "../assets/assets.repository.ts";
import { adviceFor, FORECAST_DAYS, WEATHER_ATTRIBUTION, type WeatherService } from "../weather/weather.service.ts";
import { DETOUR_FACTOR, planRoute, WALK_METERS_PER_MINUTE, type PlannerCandidate } from "./planner.ts";
import type { CandidateRecord, PlannerRepository } from "./planner.repository.ts";
import { toCityDish } from "../gastronomy/gastronomy.mapper.ts";
import type { GastronomyRepository } from "../gastronomy/gastronomy.repository.ts";
import { pickDish } from "../gastronomy/meals.ts";
import { importanceOf, planTrip, TRIP_SHAPE, weatherNoteCode, type ImportanceSignals } from "./trip.ts";

/** How far ahead a trip can start. Beyond the forecast its days are planned without weather. */
const TRIP_MAX_LEAD_DAYS = 365;

const CodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase code");

const ThemeSchema = z
  .string()
  .transform((value, ctx) => {
    const [kind, ...rest] = value.split(":");
    const code = rest.join(":");
    const schema = kind === "network" ? AssetIdSchema : kind === "type" || kind === "era" ? CodeSchema : null;
    if (!schema || !schema.safeParse(code).success) {
      ctx.addIssue({ code: "custom", message: "theme must be type:<code>, era:<code> or network:<asset id>" });
      return z.NEVER;
    }
    return { kind: kind as "type" | "era" | "network", code };
  });

const PointSchema = z
  .string()
  .transform((value) => value.split(",").map((part) => Number(part.trim())))
  .pipe(z.tuple([z.number().min(35.5).max(42.5), z.number().min(25.5).max(45)]))
  .transform(([lat, lng]) => ({ lat, lng }));

const PlanQuerySchema = z.object({
  lang: LangSchema.optional(),
  city: CodeSchema.describe("İl kodu, ör. bursa"),
  theme: ThemeSchema.describe("type:<tür kodu>, era:<dönem kodu> ya da network:<eser id> (Kentsel Ağ bağları)"),
  start: PointSchema.optional().describe("Başlangıç noktası lat,lng; verilmezse temadaki eserlerin en yoğun olduğu yer"),
  maxMinutes: z.coerce.number().int().min(15).max(600).default(120).describe("Yürüme + ziyaret süresi bütçesi, dakika"),
});

const TripThemeSchema = z.string().transform((value, ctx) => {
  const [kind, ...rest] = value.split(":");
  const code = rest.join(":");
  if ((kind === "type" || kind === "era") && CodeSchema.safeParse(code).success) {
    return { kind: kind as "type" | "era", code };
  }
  ctx.addIssue({ code: "custom", message: "theme must be type:<code> or era:<code>" });
  return z.NEVER;
});

const TripQuerySchema = z.object({
  lang: LangSchema.optional(),
  city: CodeSchema.describe("İl kodu, ör. bursa"),
  duration: TripDurationSchema.default("1").describe("half: 09:00–13:30; 1-5: o kadar tam gün, öğle molasıyla"),
  theme: TripThemeSchema.optional().describe("type:<tür kodu> ya da era:<dönem kodu>; verilmezse bütün eserler"),
  start: PointSchema.optional().describe("1. günün başlangıç noktası lat,lng; verilmezse her gün en önemli eserden başlar"),
  date: z.iso.date().optional().describe("1. günün tarihi (YYYY-MM-DD), bugünden en çok bir yıl sonrası; varsayılan bugün"),
});

const WeatherQuerySchema = z.object({
  lang: LangSchema.optional(),
  city: CodeSchema.describe("İl kodu, ör. bursa"),
});

const ESTIMATE_NOTE: Record<Lang, string> = {
  tr: `Yürüme süreleri tahminidir: kuş uçuşu mesafe × ${DETOUR_FACTOR}, dakikada ${WALK_METERS_PER_MINUTE} m.`,
  en: `Walking times are estimates: straight-line distance × ${DETOUR_FACTOR} at ${WALK_METERS_PER_MINUTE} m per minute.`,
};

const MEAL_LABEL: Record<"lunch" | "dessert", Record<Lang, string>> = {
  lunch: { tr: "Öğle molası", en: "Lunch break" },
  dessert: { tr: "Tatlı durağı", en: "Dessert stop" },
};

function weatherNoteText(code: TripWeatherNoteCode, weather: DailyForecast | null, lang: Lang, beyondForecast: boolean): string {
  if (code === "unavailable" && beyondForecast) {
    return lang === "tr"
      ? "Bu gün için henüz hava tahmini yok; plan havaya bakılmadan yapıldı."
      : "There is no forecast for this day yet; the plan does not take the weather into account.";
  }
  const afternoon = weather?.afternoonPrecipitationProbability ?? 0;
  const chance = weather?.precipitationProbability ?? 0;
  const high = Math.round(weather?.highC ?? 0);
  const texts: Record<TripWeatherNoteCode, Record<Lang, string>> = {
    afternoon_rain: {
      tr: `Öğleden sonra %${afternoon} yağış ihtimali var. Açık ve avlulu duraklar sabaha, kapalı mekânlar öğleden sonraya alındı.`,
      en: `${afternoon}% chance of rain in the afternoon. Open-air and courtyard stops come in the morning, indoor ones after noon.`,
    },
    heat: {
      tr: `Hava sıcak (en yüksek ${high}°). Açık hava durakları serin sabah saatlerine alındı.`,
      en: `A hot day (up to ${high}°). Open-air stops come in the cooler morning.`,
    },
    rain_possible: {
      tr: `Gün içinde %${chance} yağış ihtimali var, öğleden sonra düşük. Avlu durakları için yanınızda şemsiye olsun.`,
      en: `${chance}% chance of rain during the day, low in the afternoon. Keep an umbrella for the courtyards.`,
    },
    clear: {
      tr: "Hava açık. Avlular ve türbe bahçeleri için iyi bir gün.",
      en: "Clear weather. A good day for courtyards and tomb gardens.",
    },
    unavailable: {
      tr: "Hava tahmini şu an alınamadı; plan havaya bakılmadan yapıldı.",
      en: "The forecast is unavailable right now; the plan does not take the weather into account.",
    },
  };
  return texts[code][lang];
}

// en-CA formats as YYYY-MM-DD.
const turkeyDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in Türkiye, where all the cities are. */
export const turkeyToday = () => turkeyDay.format(new Date());

const turkeyHourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" });

/** The hour in Türkiye, 0-23. */
export const turkeyHour = () => Number(turkeyHourFormat.format(new Date()));

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Weather changes within minutes; plans depend on it.
const CACHE_CONTROL = "public, max-age=300";

function toCandidate(record: CandidateRecord): PlannerCandidate {
  const setting = VisitSettingSchema.safeParse(record.visit_setting);
  return {
    id: record.id,
    point: record.lat !== null && record.lng !== null ? { lat: record.lat, lng: record.lng } : null,
    typeCode: record.type_code,
    visitMinutes: record.visit_duration_min,
    setting: setting.success ? setting.data : null,
  };
}

export interface PlannerRoutesOptions {
  repository: PlannerRepository;
  assets: AssetsRepository;
  weather: WeatherService;
  mediaBaseUrl: string;
  visibility: AssetVisibility;
  /** Local dishes for a trip's lunch and dessert breaks. */
  gastronomy: GastronomyRepository;
}

export const plannerRoutes: FastifyPluginAsync<PlannerRoutesOptions> = async (
  app,
  { repository, assets, weather, mediaBaseUrl, visibility, gastronomy },
) => {
  const statuses = visibleStatuses(visibility);
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  function setHeaders(reply: FastifyReply, lang: Lang) {
    reply.header("cache-control", CACHE_CONTROL);
    reply.header("content-language", lang);
    reply.header("vary", "Accept-Language");
  }

  async function cityOf(code: string, lang: Lang) {
    const city = await repository.findCity(code);
    if (!city) throw new HttpError(404, "CITY_NOT_FOUND", `City "${code}" not found`);
    return { code: city.code, label: pick(city.label_tr, city.label_en, lang) };
  }

  /** Weather at the city's centre; null when the city has no located asset or the provider fails. */
  async function cityWeather(code: string) {
    const point = await repository.findCityPoint(code);
    return point ? weather.current(point) : null;
  }

  /** The forecast at the city's centre; empty when unknown. */
  async function cityForecast(code: string): Promise<DailyForecast[]> {
    const point = await repository.findCityPoint(code);
    return (point && (await weather.forecast(point))) ?? [];
  }

  const langOf = (request: FastifyRequest, queryLang: Lang | undefined) =>
    resolveLang(queryLang, request.headers["accept-language"]);

  app.get("/weather", {
    schema: {
      tags: ["planner"],
      summary: "İlin anlık hava durumu (Open-Meteo); sağlayıcıya ulaşılamazsa available: false",
      querystring: toOpenApiSchema(WeatherQuerySchema, "input"),
      response: { 200: toOpenApiSchema(WeatherResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<WeatherResponse> => {
    const query = parseWith(WeatherQuerySchema, request.query, "INVALID_QUERY");
    const lang = langOf(request, query.lang);
    const city = await cityOf(query.city, lang);
    const [current, daily] = await Promise.all([cityWeather(city.code), cityForecast(city.code)]);

    setHeaders(reply, lang);
    return WeatherResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      city,
      available: current !== null,
      current,
      daily,
      advice: adviceFor(current),
      attribution: WEATHER_ATTRIBUTION,
    });
  });

  app.get("/routes/plan", {
    schema: {
      tags: ["planner"],
      summary: "Tematik yürüyüş rotası: süre bütçesine sığan duraklar, en yakından ilerleyerek",
      querystring: toOpenApiSchema(PlanQuerySchema, "input"),
      response: { 200: toOpenApiSchema(RoutePlanResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<RoutePlanResponse> => {
    const query = parseWith(PlanQuerySchema, request.query, "INVALID_QUERY");
    const lang = langOf(request, query.lang);
    const city = await cityOf(query.city, lang);
    const { theme } = query;

    let ids: string[] | undefined;
    if (theme.kind === "network") {
      if (!(await repository.isVisible(theme.code))) {
        throw new HttpError(404, "ASSET_NOT_FOUND", `Asset "${theme.code}" not found`);
      }
      ids = [theme.code, ...(await repository.findLinkedIds(theme.code))];
    }
    const [records, current] = await Promise.all([
      repository.findCandidates({
        city: city.code,
        ...(theme.kind === "type" && { type: theme.code }),
        ...(theme.kind === "era" && { era: theme.code }),
        ...(ids && { ids }),
      }),
      cityWeather(city.code),
    ]);

    const advice = adviceFor(current);
    const plan = planRoute({
      candidates: records.map(toCandidate),
      start: query.start ?? null,
      ...(theme.kind === "network" && { firstId: theme.code }),
      maxMinutes: query.maxMinutes,
      preferIndoor: advice === "indoor_preferred",
    });

    const byId = new Map(records.map((record) => [record.id, record]));
    const covers = await assets.findMedia(plan.stops.map((stop) => stop.id), { coversOnly: true });
    const coverOf = new Map(covers.map((cover) => [cover.asset_id, cover]));
    const ctx = { lang, mediaBaseUrl, statuses };

    setHeaders(reply, lang);
    return RoutePlanResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      city,
      theme,
      start: plan.start,
      maxMinutes: query.maxMinutes,
      weather: current && { condition: current.condition, temperatureC: current.temperatureC, advice },
      stops: plan.stops.map(({ id, ...stop }, index) => ({
        order: index + 1,
        asset: toAssetSummary(byId.get(id) as CandidateRecord, coverOf.get(id), ctx),
        ...stop,
      })),
      totals: {
        walkMeters: plan.walkMeters,
        walkMinutes: plan.walkMinutes,
        visitMinutes: plan.visitMinutes,
        totalMinutes: plan.walkMinutes + plan.visitMinutes,
      },
      candidateCount: records.length,
      skippedWithoutCoordinates: plan.skippedWithoutCoordinates,
      notReachedCount: plan.notReachedCount,
      estimateNote: ESTIMATE_NOTE[lang],
    });
  });

  app.get("/routes/trip", {
    schema: {
      tags: ["planner"],
      summary: "Yarım günden beş güne kadar gezi: önemli eserler önce, hava tahminine göre sıralı, öğle ve tatlı molalarıyla",
      querystring: toOpenApiSchema(TripQuerySchema, "input"),
      response: { 200: toOpenApiSchema(TripPlanResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<TripPlanResponse> => {
    const query = parseWith(TripQuerySchema, request.query, "INVALID_QUERY");
    const lang = langOf(request, query.lang);
    const city = await cityOf(query.city, lang);
    const { theme, duration } = query;
    const dayCount = TRIP_SHAPE[duration].days;

    const today = turkeyToday();
    const firstDate = query.date ?? today;
    const lastAllowed = addDays(today, TRIP_MAX_LEAD_DAYS);
    if (firstDate < today || firstDate > lastAllowed) {
      throw new HttpError(400, "INVALID_QUERY", `date must be between ${today} and ${lastAllowed}`);
    }
    const lastForecast = addDays(today, FORECAST_DAYS - 1);
    const dates = Array.from({ length: dayCount }, (_, day) => addDays(firstDate, day));

    const [records, forecast, dishes] = await Promise.all([
      repository.findCandidates({
        city: city.code,
        ...(theme?.kind === "type" && { type: theme.code }),
        ...(theme?.kind === "era" && { era: theme.code }),
      }),
      cityForecast(city.code),
      gastronomy.findDishes(city.code),
    ]);
    const signals = await repository.findImportanceSignals(records.map((record) => record.id));
    const dayWeather = dates.map((date) => forecast.find((day) => day.date === date) ?? null);

    const plan = planTrip({
      candidates: records.map((record) => ({
        ...toCandidate(record),
        importance: importanceOf(signals.get(record.id) as ImportanceSignals),
      })),
      start: query.start ?? null,
      duration,
      weather: dayWeather,
    });

    const byId = new Map(records.map((record) => [record.id, record]));
    const stopIds = plan.days.flatMap((day) => day.items.flatMap((item) => (item.kind === "stop" ? [item.id] : [])));
    const covers = await assets.findMedia(stopIds, { coversOnly: true });
    const coverOf = new Map(covers.map((cover) => [cover.asset_id, cover]));
    const ctx = { lang, mediaBaseUrl, statuses };

    // Each break gets a dish of the district it is in (the previous stop's), not served before on the trip.
    const served = new Set<string>();
    const mealDishes = plan.days.map((day) => {
      let district: string | null = null;
      return day.items.map((item) => {
        if (item.kind === "stop") {
          district = byId.get(item.id)?.district ?? null;
          return null;
        }
        const dish = pickDish(dishes, item.meal, district, served);
        if (dish) served.add(dish.id);
        return dish && toCityDish(dish, lang);
      });
    });

    setHeaders(reply, lang);
    return TripPlanResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      city,
      theme: theme ?? null,
      duration: duration === "half" ? duration : String(plan.days.length),
      days: plan.days.map((day, index) => {
        const date = dates[index] as string;
        const weatherOfDay = dayWeather[index] ?? null;
        const code = weatherNoteCode(weatherOfDay);
        return {
          day: index + 1,
          date,
          weather: weatherOfDay,
          weatherNote: { code, text: weatherNoteText(code, weatherOfDay, lang, date > lastForecast) },
          items: day.items.map((item, itemIndex) =>
            item.kind === "stop"
              ? {
                  kind: "stop",
                  at: item.at,
                  asset: toAssetSummary(byId.get(item.id) as CandidateRecord, coverOf.get(item.id), ctx),
                  legMeters: item.legMeters,
                  legMinutes: item.legMinutes,
                  visitMinutes: item.visitMinutes,
                  visitMinutesEstimated: item.visitMinutesEstimated,
                  setting: item.setting,
                  settingEstimated: item.settingEstimated,
                  importance: item.importance,
                }
              : {
                  kind: "meal",
                  at: item.at,
                  meal: item.meal,
                  label: MEAL_LABEL[item.meal][lang],
                  minutes: item.minutes,
                  dish: mealDishes[index]?.[itemIndex] ?? null,
                },
          ),
          outdoorShare: day.outdoorShare,
          totals: { walkMeters: day.walkMeters, walkMinutes: day.walkMinutes, visitMinutes: day.visitMinutes },
        };
      }),
      candidateCount: records.length,
      skippedWithoutCoordinates: plan.skippedWithoutCoordinates,
      notPlannedCount: plan.notPlannedCount,
      estimateNote: ESTIMATE_NOTE[lang],
      attribution: WEATHER_ATTRIBUTION,
    });
  });
};
