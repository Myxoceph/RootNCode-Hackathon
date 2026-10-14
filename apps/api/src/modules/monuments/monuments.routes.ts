import {
  CONTRACT_VERSION,
  CitySchema,
  MonumentSchema,
  MonumentsPayloadSchema,
  type Monument,
  type MonumentsPayload,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { toCityCuisine, toMonument } from "./monuments.mapper.ts";
import type { MonumentsRepository } from "./monuments.repository.ts";

const ListQuerySchema = z.object({ city: CitySchema.optional() });
const SlugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
});

// Monument data changes only through seeds/ETL, so short client caching is safe.
const CACHE_CONTROL = "public, max-age=60";

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

export const monumentsRoutes: FastifyPluginAsync<{ repository: MonumentsRepository }> = async (
  app,
  { repository },
) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  app.get("/monuments", {
    schema: {
      tags: ["monuments"],
      summary: "Eserleri ve şehir mutfaklarını listele",
      description: "`city` verilirse yalnızca o şehrin eserleri ve mutfakları döner. Ziyaretçi ipuçlarından yalnızca onaylananlar gösterilir.",
      querystring: toOpenApiSchema(ListQuerySchema, "input"),
      response: { 200: toOpenApiSchema(MonumentsPayloadSchema), 400: errorSchema },
    },
  }, async (request, reply): Promise<MonumentsPayload> => {
    const query = ListQuerySchema.safeParse(request.query);
    if (!query.success) throw new HttpError(400, "INVALID_QUERY", describeIssues(query.error));

    const [monuments, cuisines] = await Promise.all([
      repository.findMany(query.data),
      repository.findCityCuisines(query.data),
    ]);

    reply.header("cache-control", CACHE_CONTROL);
    return {
      version: CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      monuments: monuments.map(toMonument),
      cityCuisines: cuisines.map(toCityCuisine),
    };
  });

  app.get("/monuments/:slug", {
    schema: {
      tags: ["monuments"],
      summary: "Tek bir eseri getir",
      description: "Kitabeler, iki yönlü ilişkiler (`direction`) ve onaylı ziyaretçi ipuçlarıyla birlikte.",
      params: toOpenApiSchema(SlugParamsSchema, "input"),
      response: { 200: toOpenApiSchema(MonumentSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<Monument> => {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpError(400, "INVALID_SLUG", describeIssues(params.error));

    const record = await repository.findBySlug(params.data.slug);
    if (!record) throw new HttpError(404, "MONUMENT_NOT_FOUND", `Monument "${params.data.slug}" not found`);

    reply.header("cache-control", CACHE_CONTROL);
    return toMonument(record);
  });
};
