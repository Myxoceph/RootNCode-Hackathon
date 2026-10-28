import { CONTRACT_VERSION, LangSchema, MetaEnumsResponseSchema, type MetaEnumsResponse } from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { enumLabels } from "../../lib/enums.ts";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import type { LabelRecord } from "../assets/assets.repository.ts";
import type { MetaRepository } from "./meta.repository.ts";

const QuerySchema = z.object({ lang: LangSchema.optional() });

// Lookup tables change only through imports.
const CACHE_CONTROL = "public, max-age=300";

export interface MetaRoutesOptions {
  repository: MetaRepository;
}

export const metaRoutes: FastifyPluginAsync<MetaRoutesOptions> = async (app, { repository }) => {
  app.get("/meta/enums", {
    schema: {
      tags: ["meta"],
      summary: "Filtre, lejant ve rozet kod listeleri (etiketleri ve görünür eser sayılarıyla)",
      querystring: toOpenApiSchema(QuerySchema, "input"),
      response: { 200: toOpenApiSchema(MetaEnumsResponseSchema), 400: toOpenApiSchema(ErrorResponseSchema) },
    },
  }, async (request, reply): Promise<MetaEnumsResponse> => {
    const query = QuerySchema.safeParse(request.query);
    if (!query.success) {
      const message = query.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new HttpError(400, "INVALID_QUERY", message);
    }
    const lang = resolveLang(query.data.lang, request.headers["accept-language"]);
    const records = await repository.load();

    // Database lists are sorted by label; file lists keep data/enums.json order (confidence goes certain → legend).
    const labelled = <T extends LabelRecord>(items: T[]) =>
      items
        .map((item) => ({ item, code: item.code, label: pick(item.label_tr, item.label_en, lang) }))
        .sort((a, b) => a.label.localeCompare(b.label, lang));
    const counted = (items: LabelRecord[], counts: Map<string, number>) =>
      labelled(items).map(({ code, label }) => ({ code, label, assetCount: counts.get(code) ?? 0 }));
    const plain = (items: LabelRecord[]) => labelled(items).map(({ code, label }) => ({ code, label }));

    reply.header("cache-control", CACHE_CONTROL);
    reply.header("content-language", lang);
    reply.header("vary", "Accept-Language");
    return MetaEnumsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      regions: plain(records.regions),
      cities: labelled(records.cities).map(({ item, code, label }) => ({
        code,
        label,
        assetCount: records.counts.city.get(code) ?? 0,
        region: item.region_code,
        plate: item.plate,
      })),
      assetTypes: counted(records.assetTypes, records.counts.type),
      eras: counted(records.eras, records.counts.era),
      relationTypes: plain(records.relationTypes),
      timelineEventTypes: plain(records.timelineEventTypes),
      ...enumLabels(lang),
    });
  });
};
