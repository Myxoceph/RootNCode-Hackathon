import {
  ChatRequestSchema,
  ChatResponseSchema,
  ChatStatusResponseSchema,
  CONTRACT_VERSION,
  type ChatResponse,
  type ChatStatusResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { HttpError } from "../../lib/http-error.ts";
import { resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { turkeyHour, turkeyToday } from "../planner/planner.routes.ts";
import { ask } from "./assistant.ts";
import { ModelError, type ChatModel } from "./assistant.model.ts";
import type { AssistantRepository } from "./assistant.repository.ts";
import type { ApiGet } from "./assistant.tools.ts";

/** Questions one client IP may ask per minute; each one can take seconds of model time. */
export const CHAT_RATE_LIMIT = { max: 10, timeWindow: 60_000 };
/** Questions answered at once; a small local model serves one or two at a time. */
export const MAX_CONCURRENT_CHATS = 2;
const CHAT_TIMEOUT_MS = 60_000;

export interface AssistantRoutesOptions {
  /** Null when no model is configured: the assistant answers 503 and reports itself unavailable. */
  model: ChatModel | null;
  repository: AssistantRepository;
}

export const assistantRoutes: FastifyPluginAsync<AssistantRoutesOptions> = async (app, { model, repository }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  let running = 0;

  app.get("/chat/status", {
    schema: {
      tags: ["assistant"],
      summary: "Asistan kullanılabilir mi (model tanımlı ve cevap veriyor mu)",
      response: { 200: toOpenApiSchema(ChatStatusResponseSchema) },
    },
  }, async (_request, reply): Promise<ChatStatusResponse> => {
    reply.header("cache-control", "no-store");
    return ChatStatusResponseSchema.parse({
      version: CONTRACT_VERSION,
      available: model !== null && (await model.ping()),
      model: model?.name ?? null,
    });
  });

  app.post("/chat", {
    config: { rateLimit: CHAT_RATE_LIMIT },
    schema: {
      tags: ["assistant"],
      summary: "Asistana soru: cevap yalnızca veri setinden, kaynak numaralarıyla",
      body: toOpenApiSchema(ChatRequestSchema, "input"),
      response: { 200: toOpenApiSchema(ChatResponseSchema), 400: errorSchema, 429: errorSchema, 503: errorSchema },
    },
  }, async (request, reply): Promise<ChatResponse> => {
    // Visitors' questions are never logged; failures are, without the text.
    const body = parseWith(ChatRequestSchema, request.body, "INVALID_BODY");
    if (!model) throw new HttpError(503, "ASSISTANT_UNAVAILABLE", "The assistant is not configured");
    if (running >= MAX_CONCURRENT_CHATS) throw new HttpError(503, "ASSISTANT_BUSY", "The assistant is busy, retry in a moment");
    const lang = resolveLang(body.lang, request.headers["accept-language"]);

    // Tools read our own routes as this client, so their requests count against its rate limit too.
    const api: ApiGet = async (path, query) => {
      const response = await app.inject({ method: "GET", url: path, query, remoteAddress: request.ip });
      return { statusCode: response.statusCode, body: response.json() };
    };

    running += 1;
    try {
      const result = await ask(
        model,
        { message: body.message, history: body.history, assetId: body.assetId, lang, today: turkeyToday(), hour: turkeyHour() },
        { api, repository },
        AbortSignal.timeout(CHAT_TIMEOUT_MS),
      );
      reply.header("cache-control", "no-store");
      return ChatResponseSchema.parse({
        version: CONTRACT_VERSION,
        lang,
        answer: result.answer,
        citations: result.citations,
        grounded: result.citations.length > 0,
        attachments: { trip: result.trip },
        model: model.name,
      });
    } catch (err) {
      if (err instanceof ModelError) {
        request.log.warn({ reason: err.message }, "Assistant model failed");
        throw new HttpError(503, "ASSISTANT_UNAVAILABLE", "The assistant could not answer right now");
      }
      throw err;
    } finally {
      running -= 1;
    }
  });
};
