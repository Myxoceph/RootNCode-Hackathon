import { CONTRACT_VERSION, LangSchema, MetaSoundsResponseSchema, type MetaSoundsResponse } from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { toSound } from "./sounds.mapper.ts";
import type { SoundsRepository } from "./sounds.repository.ts";

const QuerySchema = z.object({ lang: LangSchema.optional() });

// Recordings change only through imports.
const CACHE_CONTROL = "public, max-age=300";

export interface SoundsRoutesOptions {
  repository: SoundsRepository;
  mediaBaseUrl: string;
}

export const soundsRoutes: FastifyPluginAsync<SoundsRoutesOptions> = async (app, { repository, mediaBaseUrl }) => {
  app.get("/meta/sounds", {
    schema: {
      tags: ["meta"],
      summary: "Sesli Zaman Kapsülü kayıtları: adres, süre, altyazılar ve lisans",
      querystring: toOpenApiSchema(QuerySchema, "input"),
      response: { 200: toOpenApiSchema(MetaSoundsResponseSchema), 400: toOpenApiSchema(ErrorResponseSchema) },
    },
  }, async (request, reply): Promise<MetaSoundsResponse> => {
    const query = parseWith(QuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);
    const sounds = await repository.findAll();

    reply.header("cache-control", CACHE_CONTROL);
    reply.header("content-language", lang);
    reply.header("vary", "Accept-Language");
    return MetaSoundsResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      sounds: sounds.map((sound) => toSound(sound, mediaBaseUrl, lang)),
    });
  });
};
