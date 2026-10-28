import {
  AssetIdSchema,
  CONTRACT_VERSION,
  LangSchema,
  RoutePlanResponseSchema,
  VisitSettingSchema,
  WeatherResponseSchema,
  type Lang,
  type RoutePlanResponse,
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
import { adviceFor, WEATHER_ATTRIBUTION, type WeatherService } from "../weather/weather.service.ts";
import { DETOUR_FACTOR, planRoute, WALK_METERS_PER_MINUTE, type PlannerCandidate } from "./planner.ts";
import type { CandidateRecord, PlannerRepository } from "./planner.repository.ts";

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

const WeatherQuerySchema = z.object({
  lang: LangSchema.optional(),
  city: CodeSchema.describe("İl kodu, ör. bursa"),
});

const ESTIMATE_NOTE: Record<Lang, string> = {
  tr: `Yürüme süreleri tahminidir: kuş uçuşu mesafe × ${DETOUR_FACTOR}, dakikada ${WALK_METERS_PER_MINUTE} m.`,
  en: `Walking times are estimates: straight-line distance × ${DETOUR_FACTOR} at ${WALK_METERS_PER_MINUTE} m per minute.`,
};

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
}

export const plannerRoutes: FastifyPluginAsync<PlannerRoutesOptions> = async (
  app,
  { repository, assets, weather, mediaBaseUrl, visibility },
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
    const current = await cityWeather(city.code);

    setHeaders(reply, lang);
    return WeatherResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      city,
      available: current !== null,
      current,
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
};
