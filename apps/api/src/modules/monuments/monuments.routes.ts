import {
  CONTRACT_VERSION,
  CitySchema,
  type Monument,
  type MonumentsPayload,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
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
  app.get("/monuments", async (request, reply): Promise<MonumentsPayload> => {
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

  app.get("/monuments/:slug", async (request, reply): Promise<Monument> => {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) throw new HttpError(400, "INVALID_SLUG", describeIssues(params.error));

    const record = await repository.findBySlug(params.data.slug);
    if (!record) throw new HttpError(404, "MONUMENT_NOT_FOUND", `Monument "${params.data.slug}" not found`);

    reply.header("cache-control", CACHE_CONTROL);
    return toMonument(record);
  });
};
