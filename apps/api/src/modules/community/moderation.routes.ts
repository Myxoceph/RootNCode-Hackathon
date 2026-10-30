import {
  ContributionStatusSchema,
  LangSchema,
  ModerationItemSchema,
  ModerationListResponseSchema,
  RejectContributionRequestSchema,
  type ModerationItem,
  type ModerationListResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { requireUser } from "./auth.ts";
import { toModerationItem } from "./community.mapper.ts";
import type { PhotoUrls } from "./photo-urls.ts";
import type { CommunityRepository, ReviewDecision } from "./community.repository.ts";

const QueueQuerySchema = z.object({
  status: ContributionStatusSchema.default("pending"),
  lang: LangSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const IdParamsSchema = z.object({ id: z.uuid() });
const ReviewQuerySchema = z.object({ lang: LangSchema.optional() });

const bearer = [{ bearerAuth: [] }];

export interface ModerationRoutesOptions {
  repository: CommunityRepository;
  /** Signs the paths of photos waiting for review. */
  photoUrls: PhotoUrls;
}

/** Moderation queue. Every route requires a moderator or admin (`npm run account:create`). */
export const moderationRoutes: FastifyPluginAsync<ModerationRoutesOptions> = async (app, { repository, photoUrls }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const authErrors = { 400: errorSchema, 401: errorSchema, 403: errorSchema };

  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  app.get("/admin/contributions", {
    schema: {
      tags: ["moderation"],
      summary: "Moderasyon kuyruğu (varsayılan: bekleyenler, eskiden yeniye)",
      security: bearer,
      querystring: toOpenApiSchema(QueueQuerySchema, "input"),
      response: { 200: toOpenApiSchema(ModerationListResponseSchema), ...authErrors },
    },
  }, async (request): Promise<ModerationListResponse> => {
    await requireUser(request, repository, "moderator");
    const query = parseWith(QueueQuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);
    const { total, items } = await repository.findQueue(query);

    return ModerationListResponseSchema.parse({
      total,
      limit: query.limit,
      offset: query.offset,
      items: items.map((item) => toModerationItem(item, lang, photoUrls)),
    });
  });

  async function review(request: FastifyRequest, decision: ReviewDecision): Promise<ModerationItem> {
    const moderator = await requireUser(request, repository, "moderator");
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const { lang: queryLang } = parseWith(ReviewQuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(queryLang, request.headers["accept-language"]);

    const result = await repository.review(id, moderator.id, decision);
    if (result === "not_found") throw new HttpError(404, "CONTRIBUTION_NOT_FOUND", `Contribution "${id}" not found`);
    if (result === "already_reviewed") {
      throw new HttpError(409, "ALREADY_REVIEWED", `Contribution "${id}" has already been reviewed`);
    }
    return ModerationItemSchema.parse(toModerationItem(result, lang, photoUrls));
  }

  const reviewResponses = { 200: toOpenApiSchema(ModerationItemSchema), ...authErrors, 404: errorSchema, 409: errorSchema };

  app.post("/admin/contributions/:id/approve", {
    schema: {
      tags: ["moderation"],
      summary: "Katkıyı onayla (nabızda görünür)",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      querystring: toOpenApiSchema(ReviewQuerySchema, "input"),
      response: reviewResponses,
    },
  }, (request) => review(request, { status: "approved" }));

  app.post("/admin/contributions/:id/reject", {
    schema: {
      tags: ["moderation"],
      summary: "Katkıyı reddet; gerekçe yazara gösterilir",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      querystring: toOpenApiSchema(ReviewQuerySchema, "input"),
      body: toOpenApiSchema(RejectContributionRequestSchema, "input"),
      response: reviewResponses,
    },
  }, async (request) => {
    // Authentication first, so an anonymous caller gets 401 rather than a body error.
    await requireUser(request, repository, "moderator");
    const { reason } = parseWith(RejectContributionRequestSchema, request.body, "INVALID_BODY");
    return review(request, { status: "rejected", reason });
  });

  app.post("/admin/users/:id/ban", {
    schema: {
      tags: ["moderation"],
      summary: "Ziyaretçiyi engelle: artık katkı gönderemez, onaylı katkıları nabızdan kalkar",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 204: { type: "null" }, ...authErrors, 404: errorSchema },
    },
  }, async (request, reply) => {
    await requireUser(request, repository, "moderator");
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    if (!(await repository.banVisitor(id))) throw new HttpError(404, "USER_NOT_FOUND", `Visitor "${id}" not found`);
    return reply.code(204).send();
  });
};
