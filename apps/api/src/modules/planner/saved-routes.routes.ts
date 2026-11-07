import {
  CONTRACT_VERSION,
  SavedRouteIdSchema,
  SavedRouteSchema,
  SavedRoutesResponseSchema,
  SaveRouteRequestSchema,
  type SavedRoute,
  type SavedRoutesResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.ts";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import type { SavedRouteRecord, SavedRoutesRepository } from "./saved-routes.repository.ts";

export interface SavedRoutesRoutesOptions {
  repository: SavedRoutesRepository;
  community: CommunityRepository;
}

const IdParamsSchema = z.object({ id: SavedRouteIdSchema });
/** A two-day trip plan is ~60 KB of JSON, a five-day one up to ~230 KB; the API's own limit is kept for every other request. */
const SAVE_BODY_LIMIT = 512 * 1024;
const bearer = [{ bearerAuth: [] }];

/** A route saved under an older contract that no longer parses is left out rather than failing the list. */
function toSavedRoute(record: SavedRouteRecord): SavedRoute | null {
  const route = SavedRouteSchema.safeParse({ ...(record.route as object), savedAt: record.saved_at.toISOString() });
  return route.success ? route.data : null;
}

/**
 * Profil · Kaydettiklerim (`/me/routes`): the routes and Rehber answers the user kept, on their
 * account, so every device shows the same list and another account on the same phone shows its own.
 */
export const savedRoutesRoutes: FastifyPluginAsync<SavedRoutesRoutesOptions> = async (app, { repository, community }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };

  app.get("/me/routes", {
    schema: {
      tags: ["planner"],
      summary: "Kaydettiğim rotalar (son kaydedilen önce)",
      security: bearer,
      response: { 200: toOpenApiSchema(SavedRoutesResponseSchema), ...denied },
    },
  }, async (request, reply): Promise<SavedRoutesResponse> => {
    const user = await requireUser(request, community);
    reply.header("cache-control", "no-store");
    const items = (await repository.list(user.id)).map(toSavedRoute).filter((route) => route !== null);
    return SavedRoutesResponseSchema.parse({ version: CONTRACT_VERSION, items });
  });

  app.post("/me/routes", {
    bodyLimit: SAVE_BODY_LIMIT,
    schema: {
      tags: ["planner"],
      summary: "Rotayı kaydet; aynı plan (key) yeniden kaydedilince öncekinin yerine geçer",
      security: bearer,
      body: toOpenApiSchema(SaveRouteRequestSchema, "input"),
      response: { 200: toOpenApiSchema(SavedRouteSchema), 400: errorSchema, ...denied },
    },
  }, async (request): Promise<SavedRoute> => {
    const user = await requireUser(request, community);
    const { key, route } = parseWith(SaveRouteRequestSchema, request.body, "INVALID_BODY");
    const saved = await repository.save(user.id, { id: route.id, key, kind: route.kind, body: route as unknown as Prisma.InputJsonValue });
    return toSavedRoute(saved)!;
  });

  app.delete("/me/routes/:id", {
    schema: {
      tags: ["planner"],
      summary: "Kaydettiğim rotayı sil",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 204: { type: "null" }, 400: errorSchema, ...denied, 404: errorSchema },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    if (!(await repository.remove(user.id, id))) throw new HttpError(404, "ROUTE_NOT_FOUND", "Saved route not found");
    return reply.code(204).send();
  });
};
