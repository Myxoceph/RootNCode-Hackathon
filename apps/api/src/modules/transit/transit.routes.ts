import {
  AssetIdSchema,
  CONTRACT_VERSION,
  LangSchema,
  TRANSIT_CITY,
  TransitEntryPointCodeSchema,
  TransitEntryPointsResponseSchema,
  TransitPlanResponseSchema,
  type Lang,
  type TransitEntryPointsResponse,
  type TransitItinerary,
  type TransitPlanResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import type { Point } from "../assets/assets.network.ts";
import type { TransitPlanner } from "./otp.client.ts";
import { ENTRY_POINTS, inPilotArea, TRANSIT_SOURCE } from "./transit.places.ts";
import type { TransitRepository } from "./transit.repository.ts";

const CACHE_MS = 60_000;
const CACHE_SIZE = 200;
/** Far enough for a visit planned a week ahead; the timetable's calendar runs years longer. */
const MAX_DAYS_AHEAD = 14;

const PointSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  .transform((value) => {
    const [lat, lng] = value.split(",").map(Number);
    return { kind: "point" as const, lat: lat!, lng: lng! };
  });
const EntrySchema = TransitEntryPointCodeSchema.transform((code) => ({ kind: "entry" as const, code }));
const AssetEndSchema = AssetIdSchema.transform((id) => ({ kind: "asset" as const, id }));

const PlanQuerySchema = z.object({
  lang: LangSchema.optional(),
  from: z.union([PointSchema, EntrySchema, AssetEndSchema]).describe("lat,lng, bir giriş noktası kodu (konya-gari…) ya da eser id"),
  to: z.union([PointSchema, AssetEndSchema]).describe("Eser id ya da lat,lng"),
  at: z.iso.datetime({ offset: true }).optional().describe("Bu saatten sonra kalkan seferler; verilmezse şimdi"),
});
const LangQuerySchema = z.object({ lang: LangSchema.optional() });

type End = z.infer<typeof PlanQuerySchema>["from"];

const unavailableHere = () =>
  new HttpError(400, "TRANSIT_NOT_AVAILABLE_HERE", "Transit directions are piloted in Konya only");

export interface TransitRoutesOptions {
  /** Null when OTP_URL is not set: the plan route answers 503. */
  planner: TransitPlanner | null;
  repository: TransitRepository;
}

export const transitRoutes: FastifyPluginAsync<TransitRoutesOptions> = async (app, { planner, repository }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const plans = new Map<string, { at: number; itineraries: TransitItinerary[] }>();

  /** The end's name and point in the visitor's language; only places inside the Konya graph. */
  async function resolve(end: End, lang: Lang): Promise<Point & { name: string; assetId: string | null }> {
    if (end.kind === "entry") {
      const place = ENTRY_POINTS[end.code];
      return { name: place[lang], lat: place.lat, lng: place.lng, assetId: null };
    }
    if (end.kind === "point") {
      if (!inPilotArea(end)) throw unavailableHere();
      return { name: lang === "en" ? "Your location" : "Konumun", lat: end.lat, lng: end.lng, assetId: null };
    }
    const asset = await repository.findAsset(end.id);
    if (!asset) throw new HttpError(404, "ASSET_NOT_FOUND", `Asset "${end.id}" not found`);
    if (asset.city_code !== TRANSIT_CITY) throw unavailableHere();
    if (asset.lat === null || asset.lng === null) {
      throw new HttpError(400, "ASSET_WITHOUT_LOCATION", `Asset "${end.id}" has no location to route to`);
    }
    return { name: pick(asset.name_tr, asset.name_en, lang), lat: asset.lat, lng: asset.lng, assetId: asset.id };
  }

  app.get("/transit/entry-points", {
    schema: {
      tags: ["planner"],
      summary: "Toplu taşıma rotasının başlayabileceği yerler (Konya pilotu): gar, YHT garı, otogar",
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(TransitEntryPointsResponseSchema), 400: errorSchema },
    },
  }, async (request, reply): Promise<TransitEntryPointsResponse> => {
    const lang = resolveLang(parseWith(LangQuerySchema, request.query, "INVALID_QUERY").lang, request.headers["accept-language"]);
    reply.header("cache-control", "public, max-age=3600");
    return TransitEntryPointsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      city: TRANSIT_CITY,
      items: Object.entries(ENTRY_POINTS).map(([code, place]) => ({ code, name: place[lang], lat: place.lat, lng: place.lng })),
    });
  });

  app.get("/transit/plan", {
    schema: {
      tags: ["planner"],
      summary: "Otobüs ve tramvayla nasıl gidilir (Konya pilotu): yürüme, biniş ve iniş durakları, saatler, güzergâh",
      querystring: toOpenApiSchema(PlanQuerySchema, "input"),
      response: { 200: toOpenApiSchema(TransitPlanResponseSchema), 400: errorSchema, 404: errorSchema, 503: errorSchema },
    },
  }, async (request, reply): Promise<TransitPlanResponse> => {
    const query = parseWith(PlanQuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);
    const at = query.at ? new Date(query.at) : new Date();
    if (at.getTime() > Date.now() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
      throw new HttpError(400, "INVALID_QUERY", `at must be within ${MAX_DAYS_AHEAD} days`);
    }
    if (!planner) throw new HttpError(503, "TRANSIT_UNAVAILABLE", "Transit directions are not configured");
    const [from, to] = await Promise.all([resolve(query.from, lang), resolve(query.to, lang)]);

    // Same ends within a minute: the popup and the assistant ask for the same plan.
    const key = JSON.stringify([from.lat, from.lng, to.lat, to.lng, from.name, to.name, Math.floor(at.getTime() / CACHE_MS)]);
    let itineraries = plans.get(key)?.itineraries;
    if (!itineraries) {
      const planned = await planner.plan(from, to, at);
      if (planned === null) throw new HttpError(503, "TRANSIT_UNAVAILABLE", "Transit directions could not be planned right now");
      itineraries = planned;
      plans.set(key, { at: Date.now(), itineraries });
      if (plans.size > CACHE_SIZE) plans.delete(plans.keys().next().value!);
    }

    reply.header("cache-control", "no-store");
    return TransitPlanResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      city: TRANSIT_CITY,
      from: { name: from.name, lat: from.lat, lng: from.lng, stopCode: null },
      to: { name: to.name, lat: to.lat, lng: to.lng, stopCode: null, assetId: to.assetId },
      itineraries,
      source: { ...TRANSIT_SOURCE[lang], license: TRANSIT_SOURCE.license, url: TRANSIT_SOURCE.url },
    });
  });
};
