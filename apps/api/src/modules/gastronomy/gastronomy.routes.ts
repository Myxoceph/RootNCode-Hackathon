import { CityDishesResponseSchema, CONTRACT_VERSION, LangSchema, type CityDishesResponse } from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { toCityDish } from "./gastronomy.mapper.ts";
import type { GastronomyRepository } from "./gastronomy.repository.ts";

const ParamsSchema = z.object({ code: z.string().regex(/^[a-z]+$/, "must be a city code").describe("İl kodu, ör. bursa") });
const QuerySchema = z.object({ lang: LangSchema.optional() });

// Dishes change only through imports.
const CACHE_CONTROL = "public, max-age=300";

export interface GastronomyRoutesOptions {
  repository: GastronomyRepository;
}

export const gastronomyRoutes: FastifyPluginAsync<GastronomyRoutesOptions> = async (app, { repository }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  app.get("/cities/:code/dishes", {
    schema: {
      tags: ["gastronomy"],
      summary: "İlin yöresel lezzetleri (coğrafi işaret tesciliyle, kaynaklı)",
      params: toOpenApiSchema(ParamsSchema, "input"),
      querystring: toOpenApiSchema(QuerySchema, "input"),
      response: { 200: toOpenApiSchema(CityDishesResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<CityDishesResponse> => {
    const { code } = parseWith(ParamsSchema, request.params, "INVALID_QUERY");
    const query = parseWith(QuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);
    const city = await repository.findCity(code);
    if (!city) throw new HttpError(404, "CITY_NOT_FOUND", `City "${code}" not found`);
    const dishes = await repository.findDishes(city.code);

    reply.header("cache-control", CACHE_CONTROL);
    reply.header("content-language", lang);
    reply.header("vary", "Accept-Language");
    return CityDishesResponseSchema.parse({
      version: CONTRACT_VERSION,
      lang,
      city: { code: city.code, label: pick(city.label_tr, city.label_en, lang) },
      dishes: dishes.map((dish) => toCityDish(dish, lang)),
    });
  });
};
