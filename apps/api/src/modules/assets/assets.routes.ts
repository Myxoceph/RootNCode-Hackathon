import {
  AR_MINDAR_VERSION,
  ArTargetsResponseSchema,
  arTargetMindKey,
  AssetDetailSchema,
  AssetIdSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  CONTRACT_VERSION,
  LangSchema,
  NearbyAssetsResponseSchema,
  type AssetDetail,
  type AssetListResponse,
  type AssetRelationsResponse,
  type ArTargetsResponse,
  type Lang,
  type NearbyAssetsResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { toSoundRecording } from "../sounds/sounds.mapper.ts";
import type { SoundsRepository } from "../sounds/sounds.repository.ts";
import { ambientKeyOf, APPROXIMATE_SOURCE, toAssetDetail, toAssetRelation, toAssetSummary, toCoordinates, toOutsideRelation, type MapperContext } from "./assets.mapper.ts";
import { boundingBox, distanceMeters, selectRelations } from "./assets.network.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import { requireUser } from "../community/auth.ts";
import {
  ALL_ASSET_STATUSES,
  visibleStatuses,
  type AssetSummaryRecord,
  type AssetsRepository,
  type AssetVisibility,
} from "./assets.repository.ts";

const CodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase code");

const BboxSchema = z
  .string()
  .transform((value) => value.split(",").map((part) => Number(part.trim())))
  .pipe(z.tuple([z.number(), z.number(), z.number(), z.number()]))
  .refine(([minLng, minLat, maxLng, maxLat]) => minLng <= maxLng && minLat <= maxLat, {
    message: "bbox must be minLng,minLat,maxLng,maxLat",
  });

const ListQuerySchema = z.object({
  lang: LangSchema.optional().describe("Yanıt dili; verilmezse Accept-Language, o da yoksa tr"),
  city: CodeSchema.optional().describe("İl kodu (data/enums.json), ör. bursa"),
  type: CodeSchema.optional().describe("Eser türü kodu, ör. cami"),
  era: CodeSchema.optional().describe("Dönem kodu, ör. erken-osmanli"),
  q: z.string().trim().min(1).max(100).optional().describe("Ad araması; Türkçe karaktersiz yazım da eşleşir"),
  bbox: BboxSchema.optional().describe("Harita kutusu: minLng,minLat,maxLng,maxLat (koordinatı olmayan eserler dışarıda kalır)"),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const DetailParamsSchema = z.object({ id: AssetIdSchema });
const DetailQuerySchema = z.object({ lang: LangSchema.optional() });

const NearbyQuerySchema = z.object({
  lang: LangSchema.optional(),
  radius: z.coerce.number().int().min(100).max(50_000).default(2_000).describe("Yarıçap, metre"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Asset data changes only through imports, so short client caching is safe.
const CACHE_CONTROL = "public, max-age=60";

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function setLanguageHeaders(reply: FastifyReply, lang: Lang): void {
  reply.header("cache-control", CACHE_CONTROL);
  reply.header("content-language", lang);
  reply.header("vary", "Accept-Language");
}

function requestLang(request: FastifyRequest, queryLang: Lang | undefined): Lang {
  return resolveLang(queryLang, request.headers["accept-language"]);
}

/** Validates `:id` and the query string of a per-asset route. */
function parseAssetRequest<Query extends z.ZodType>(
  request: FastifyRequest,
  querySchema: Query,
): { id: string; query: z.output<Query> } {
  const params = DetailParamsSchema.safeParse(request.params);
  if (!params.success) throw new HttpError(400, "INVALID_ID", describeIssues(params.error));
  const query = querySchema.safeParse(request.query);
  if (!query.success) throw new HttpError(400, "INVALID_QUERY", describeIssues(query.error));
  return { id: params.data.id, query: query.data };
}

function notFound(id: string): HttpError {
  return new HttpError(404, "ASSET_NOT_FOUND", `Asset "${id}" not found`);
}

export interface AssetsRoutesOptions {
  repository: AssetsRepository;
  mediaBaseUrl: string;
  visibility: AssetVisibility;
  /** Ambient recordings for `ambientSound.recording`. */
  sounds: SoundsRepository;
}

/** An asset's page, as `GET /assets/:id` serves it, from a repository that sees `statuses`. */
async function assetDetail(
  id: string,
  lang: Lang,
  { repository, sounds, mediaBaseUrl, statuses }: { repository: AssetsRepository; sounds: SoundsRepository; mediaBaseUrl: string; statuses: string[] },
): Promise<AssetDetail> {
  const record = await repository.findById(id);
  if (!record) throw notFound(id);
  const soundKey = ambientKeyOf(record);
  const [media, secondaryTypes, sound] = await Promise.all([
    repository.findMedia([record.id]),
    repository.findAssetTypes(record.secondary_types),
    soundKey ? sounds.findByKey(soundKey) : null,
  ]);
  const recording = sound && toSoundRecording(sound, mediaBaseUrl, lang);
  return AssetDetailSchema.parse(toAssetDetail(record, media, secondaryTypes, { lang, mediaBaseUrl, statuses }, recording));
}

export interface AdminAssetPreviewOptions {
  /** A repository made with `ALL_ASSET_STATUSES`, so drafts are found too. */
  repository: AssetsRepository;
  sounds: SoundsRepository;
  mediaBaseUrl: string;
  community: CommunityRepository;
}

/** `GET /admin/assets/:id/preview`: the asset's page as the app would show it, drafts included; admins only. */
export const adminAssetPreviewRoutes: FastifyPluginAsync<AdminAssetPreviewOptions> = async (app, { repository, sounds, mediaBaseUrl, community }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  app.get("/admin/assets/:id/preview", {
    schema: {
      tags: ["moderation"],
      summary: "Eserin uygulamadaki sayfası (taslaklar dahil), panelin önizlemesi için",
      security: [{ bearerAuth: [] }],
      params: toOpenApiSchema(DetailParamsSchema, "input"),
      querystring: toOpenApiSchema(DetailQuerySchema, "input"),
      response: { 200: toOpenApiSchema(AssetDetailSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<AssetDetail> => {
    await requireUser(request, community, "admin");
    const { id, query } = parseAssetRequest(request, DetailQuerySchema);
    reply.header("cache-control", "no-store");
    return assetDetail(id, requestLang(request, query.lang), { repository, sounds, mediaBaseUrl, statuses: ALL_ASSET_STATUSES });
  });
};

export const assetsRoutes: FastifyPluginAsync<AssetsRoutesOptions> = async (
  app,
  { repository, mediaBaseUrl, visibility, sounds },
) => {
  const statuses = visibleStatuses(visibility);
  const context = (lang: Lang): MapperContext => ({ lang, mediaBaseUrl, statuses });
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  app.get("/assets", {
    schema: {
      tags: ["assets"],
      summary: "Eser listesi (liste ve harita)",
      querystring: toOpenApiSchema(ListQuerySchema, "input"),
      response: { 200: toOpenApiSchema(AssetListResponseSchema), 400: errorSchema },
    },
  }, async (request, reply): Promise<AssetListResponse> => {
    const query = ListQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpError(400, "INVALID_QUERY", describeIssues(query.error));
    const { lang: queryLang, ...filters } = query.data;
    const lang = requestLang(request, queryLang);

    const { total, items } = await repository.findMany(filters);
    const covers = await repository.findMedia(items.map((item) => item.id), { coversOnly: true });
    const coverOf = new Map(covers.map((cover) => [cover.asset_id, cover]));

    setLanguageHeaders(reply, lang);
    return AssetListResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      total,
      limit: filters.limit,
      offset: filters.offset,
      items: items.map((item) => toAssetSummary(item, coverOf.get(item.id), context(lang))),
    });
  });

  // Taşın Dili: the inscriptions the camera can find, with where they are. Small (a row each),
  // so the app picks those near the visitor without fetching every asset first.
  app.get("/ar-targets", {
    schema: {
      tags: ["assets"],
      summary: "Taşın Dili: kamerayla tanınan kitabeler, konumları ve .mind dosyaları",
      response: { 200: toOpenApiSchema(ArTargetsResponseSchema) },
    },
  }, async (_request, reply): Promise<ArTargetsResponse> => {
    const rows = await repository.findArTargets();
    const items = rows.flatMap((row) => {
      const media = row.asset_media?.media;
      const variant = media?.status === "published" ? media.media_variant[0] : undefined;
      if (!variant) return [];
      // Approximate points (a district's middle) are too rough to say the visitor is at the inscription.
      const located = (point: { lat: number | null; lng: number | null; coord_source: string | null } | null) =>
        point && point.lat !== null && point.lng !== null && point.coord_source !== APPROXIMATE_SOURCE ? point : null;
      const at = located(row.asset) ?? located(row.asset.asset);
      return [{
        assetId: row.asset_id,
        inscriptionId: row.slug,
        city: row.asset.city_code,
        coordinates: at ? { lat: at.lat!, lng: at.lng! } : null,
        mindUrl: `${mediaBaseUrl}/${arTargetMindKey(variant.key)}`,
        mindarVersion: AR_MINDAR_VERSION,
      }];
    });
    reply.header("cache-control", CACHE_CONTROL);
    return ArTargetsResponseSchema.parse({ version: CONTRACT_VERSION, items });
  });

  app.get("/assets/:id", {
    schema: {
      tags: ["assets"],
      summary: "Eser detayı: bölümler, kaynaklar, güven düzeyleri, kitabeler, görseller",
      params: toOpenApiSchema(DetailParamsSchema, "input"),
      querystring: toOpenApiSchema(DetailQuerySchema, "input"),
      response: { 200: toOpenApiSchema(AssetDetailSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<AssetDetail> => {
    const { id, query } = parseAssetRequest(request, DetailQuerySchema);
    const lang = requestLang(request, query.lang);

    const detail = await assetDetail(id, lang, { repository, sounds, mediaBaseUrl, statuses });
    setLanguageHeaders(reply, lang);
    return detail;
  });

  app.get("/assets/:id/relations", {
    schema: {
      tags: ["assets"],
      summary: "Eserin bağları (Kentsel Ağ): iki yönlü, yalnızca görünür eserlere",
      params: toOpenApiSchema(DetailParamsSchema, "input"),
      querystring: toOpenApiSchema(DetailQuerySchema, "input"),
      response: { 200: toOpenApiSchema(AssetRelationsResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<AssetRelationsResponse> => {
    const { id, query } = parseAssetRequest(request, DetailQuerySchema);
    const lang = requestLang(request, query.lang);

    if (!(await repository.findLocation(id))) throw notFound(id);
    const relations = await repository.findRelations(id);
    const otherIds = new Set(relations.flatMap((r) => [r.source_asset_id, r.target_asset_id]));
    otherIds.delete(id);
    const others = new Map((await repository.findSummaries([...otherIds])).map((other) => [other.id, other]));
    const { items, unavailable } = selectRelations(id, relations, (otherId) => others.has(otherId));
    // A link recorded here to a place with no record at all, named by the source: shown by name.
    const existing = await repository.findExistingIds(unavailable.map((link) => link.otherId));
    const outside = unavailable.filter(
      (link) => link.direction === "outgoing" && !existing.has(link.otherId) && link.relation.target_name_tr,
    );

    const [covers, citations] = await Promise.all([
      repository.findMedia(items.map((item) => item.otherId), { coversOnly: true }),
      repository.findRelationCitations([...items, ...outside].map((item) => item.relation)),
    ]);
    const coverOf = new Map(covers.map((cover) => [cover.asset_id, cover]));
    const ctx = context(lang);
    const mapped = items.map((item) => {
      const other = others.get(item.otherId);
      if (!other) throw new Error(`relation target ${item.otherId} vanished`);
      return toAssetRelation(item, other, coverOf.get(item.otherId), citations, ctx);
    });
    mapped.sort((a, b) => a.type.code.localeCompare(b.type.code) || a.asset.name.localeCompare(b.asset.name, "tr"));

    setLanguageHeaders(reply, lang);
    return AssetRelationsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      assetId: id,
      items: mapped,
      outside: outside
        .map((link) => toOutsideRelation(link, pick(link.relation.target_name_tr!, link.relation.target_name_en, lang), citations, ctx))
        .sort((a, b) => a.type.code.localeCompare(b.type.code) || a.name.localeCompare(b.name, "tr")),
      unavailableCount: unavailable.length - outside.length,
    });
  });

  app.get("/assets/:id/nearby", {
    schema: {
      tags: ["assets"],
      summary: "Yakındaki eserler, en yakından uzağa (kuş uçuşu)",
      params: toOpenApiSchema(DetailParamsSchema, "input"),
      querystring: toOpenApiSchema(NearbyQuerySchema, "input"),
      response: { 200: toOpenApiSchema(NearbyAssetsResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<NearbyAssetsResponse> => {
    const { id, query } = parseAssetRequest(request, NearbyQuerySchema);
    const lang = requestLang(request, query.lang);

    const location = await repository.findLocation(id);
    if (!location) throw notFound(id);
    const origin = toCoordinates(location);

    let nearest: { record: AssetSummaryRecord; distance: number }[] = [];
    if (origin) {
      const candidates = await repository.findLocatedInBox(boundingBox(origin, query.radius), id);
      nearest = candidates
        .flatMap((record) =>
          record.lat === null || record.lng === null
            ? []
            : [{ record, distance: distanceMeters(origin, { lat: record.lat, lng: record.lng }) }],
        )
        .filter(({ distance }) => distance <= query.radius)
        .sort((a, b) => a.distance - b.distance || a.record.id.localeCompare(b.record.id))
        .slice(0, query.limit);
    }
    const covers = await repository.findMedia(nearest.map(({ record }) => record.id), { coversOnly: true });
    const coverOf = new Map(covers.map((cover) => [cover.asset_id, cover]));
    const ctx = context(lang);

    setLanguageHeaders(reply, lang);
    return NearbyAssetsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      assetId: id,
      origin,
      radiusMeters: query.radius,
      items: nearest.map(({ record, distance }) => ({
        distanceMeters: Math.round(distance),
        asset: toAssetSummary(record, coverOf.get(record.id), ctx),
      })),
    });
  });
};
