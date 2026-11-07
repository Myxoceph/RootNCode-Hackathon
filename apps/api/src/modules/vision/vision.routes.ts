import {
  CONTRACT_VERSION,
  VISION_DEFAULT_QUESTION,
  VISION_IMAGE_TYPES,
  VISION_MAX_BYTES,
  VisionAskQuerySchema,
  VisionAskResponseSchema,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { hedge } from "../../lib/hedge.ts";
import { HttpError } from "../../lib/http-error.ts";
import { resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { plainText, resolveCitations } from "../assistant/assistant.ts";
import type { AssistantRepository } from "../assistant/assistant.repository.ts";
import { requireAccount } from "../assistant/assistant.routes.ts";
import { runTool, SourceRegistry, type ApiGet } from "../assistant/assistant.tools.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import { turkeyHour, turkeyToday } from "../planner/planner.routes.ts";
import { VisionError, type VisionClient } from "./vision.client.ts";
import { visionSystem, visionSystemOpen } from "./vision.ts";

/** Photos one client IP may send per minute: each is seconds of model time. */
export const VISION_RATE_LIMIT = { max: 10, timeWindow: 60_000 };
/** A look takes 3 to 8 s; one that is still out at 9 s gets a second, and all end under the app's 30 s wait. */
export const VISION_HEDGE_MS = [0, 9_000];
export const VISION_DEADLINE_MS = 25_000;

export interface VisionRoutesOptions {
  /** Null when no vision model is configured: the route answers 503. */
  client: VisionClient | null;
  community: CommunityRepository;
  repository: AssistantRepository;
}

/** The media type without its parameters. */
const essence = (contentType: string | undefined) => (contentType ?? "").split(";")[0]!.trim().toLowerCase();

export const visionRoutes: FastifyPluginAsync<VisionRoutesOptions> = async (app, { client, community, repository }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  // Only in this plugin: the rest of the API keeps its 16 KB JSON body limit.
  app.addContentTypeParser([...VISION_IMAGE_TYPES], { parseAs: "buffer", bodyLimit: VISION_MAX_BYTES }, (_request, body, done) =>
    done(null, body),
  );

  app.post("/vision/ask", {
    bodyLimit: VISION_MAX_BYTES,
    config: { rateLimit: VISION_RATE_LIMIT },
    schema: {
      tags: ["assistant"],
      summary: "Taşa Sor (yalnızca hesapla): eserde çekilen bir fotoğrafı, eserin kaydıyla kısa ve sesli okunacak biçimde açıkla",
      description: `Gövde fotoğrafın kendisi (${VISION_IMAGE_TYPES.join(", ")}), en çok ${VISION_MAX_BYTES / 1024} KB. Fotoğraf saklanmaz. \`assetId\` verilmezse cevap yalnızca fotoğraftan gelir, kaynak işareti olmaz.`,
      security: [{ bearerAuth: [] }],
      querystring: toOpenApiSchema(VisionAskQuerySchema, "input"),
      response: {
        200: toOpenApiSchema(VisionAskResponseSchema),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        429: errorSchema,
        503: errorSchema,
      },
    },
  }, async (request, reply) => {
    // Photos and questions are never logged.
    await requireAccount(request, community);
    const query = parseWith(VisionAskQuerySchema, request.query, "INVALID_QUERY");
    if (!client) throw new HttpError(503, "VISION_UNAVAILABLE", "Taşa Sor is not configured");
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      throw new HttpError(400, "INVALID_IMAGE", `Send the photo itself as one of ${VISION_IMAGE_TYPES.join(", ")}`);
    }
    const image = request.body;
    const type = essence(request.headers["content-type"]);
    const lang = resolveLang(query.lang, request.headers["accept-language"]);

    // The asset's page as the assistant reads it: same record, same rules for what is shown.
    const api: ApiGet = async (path, params) => {
      const response = await app.inject({ method: "GET", url: path, query: params, remoteAddress: request.ip });
      return { statusCode: response.statusCode, body: response.json() };
    };
    const sources = new SourceRegistry();
    let system: string;
    if (query.assetId) {
      const page = await runTool("asset_details", JSON.stringify({ id: query.assetId }), {
        api,
        repository,
        sources,
        lang,
        today: turkeyToday(),
        hour: turkeyHour(),
      });
      if (page.content.startsWith('{"error"')) throw new HttpError(404, "ASSET_NOT_FOUND", `No asset with id "${query.assetId}"`);
      const { ref } = JSON.parse(page.content) as { ref: number };
      system = visionSystem(lang, ref, page.content);
    } else {
      // Near no known asset: the photo alone, and no source to cite (a stray marker is dropped).
      system = visionSystemOpen(lang);
    }

    let text: string;
    try {
      text = await hedge(
        (signal) => client.look({ image, type, system, question: query.question ?? VISION_DEFAULT_QUESTION, signal }),
        { starts: VISION_HEDGE_MS, deadlineMs: VISION_DEADLINE_MS, retryable: (err) => err instanceof VisionError, timedOut: () => new VisionError("Vision call timed out") },
      );
    } catch (err) {
      if (!(err instanceof VisionError)) throw err;
      request.log.warn({ reason: err.message }, "Vision provider failed");
      throw new HttpError(503, "VISION_UNAVAILABLE", "Taşa Sor is not available right now");
    }
    const { answer, citations } = resolveCitations(plainText(text), sources);
    // Only markers and no words: nothing to show or read.
    if (!answer.replace(/\[\d+\]/g, "").trim()) throw new HttpError(503, "VISION_UNAVAILABLE", "Taşa Sor is not available right now");
    reply.header("cache-control", "no-store");
    return VisionAskResponseSchema.parse({ version: CONTRACT_VERSION, lang, answer, citations });
  });
};
