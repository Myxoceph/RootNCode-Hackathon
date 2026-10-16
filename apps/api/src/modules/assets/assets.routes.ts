import {
  AssetDetailSchema,
  AssetIdSchema,
  AssetListResponseSchema,
  CONTRACT_VERSION,
  LangSchema,
  type AssetDetail,
  type AssetListResponse,
  type Lang,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { resolveLang } from "../../lib/lang.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { toAssetDetail, toAssetSummary, type MapperContext } from "./assets.mapper.ts";
import { visibleStatuses, type AssetsRepository, type AssetVisibility } from "./assets.repository.ts";

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

export interface AssetsRoutesOptions {
  repository: AssetsRepository;
  mediaBaseUrl: string;
  visibility: AssetVisibility;
}

export const assetsRoutes: FastifyPluginAsync<AssetsRoutesOptions> = async (
  app,
  { repository, mediaBaseUrl, visibility },
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

  app.get("/assets/:id", {
    schema: {
      tags: ["assets"],
      summary: "Eser detayı: bölümler, kaynaklar, güven düzeyleri, kitabeler, görseller",
      params: toOpenApiSchema(DetailParamsSchema, "input"),
      querystring: toOpenApiSchema(DetailQuerySchema, "input"),
      response: { 200: toOpenApiSchema(AssetDetailSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<AssetDetail> => {
    const params = DetailParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpError(400, "INVALID_ID", describeIssues(params.error));
    const query = DetailQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpError(400, "INVALID_QUERY", describeIssues(query.error));
    const lang = requestLang(request, query.data.lang);

    const record = await repository.findById(params.data.id);
    if (!record) throw new HttpError(404, "ASSET_NOT_FOUND", `Asset "${params.data.id}" not found`);
    const [media, secondaryTypes] = await Promise.all([
      repository.findMedia([record.id]),
      repository.findAssetTypes(record.secondary_types),
    ]);

    setLanguageHeaders(reply, lang);
    return AssetDetailSchema.parse(toAssetDetail(record, media, secondaryTypes, context(lang)));
  });
};
