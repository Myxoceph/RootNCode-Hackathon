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
/**
 * A first question (no history) asked again with the same words, page and language is answered
 * from memory for this long: the hosted model takes 5 to 30 s, so the demo's questions are asked once
 * backstage (docs/deploy.md). Short enough for the weather in a trip answer to stay current.
 */
export const ANSWER_CACHE_MS = 30 * 60_000;
const ANSWER_CACHE_SIZE = 200;

/** Same question in other case or spacing; the hour is kept because evening trips start tomorrow. */
function cacheKey(message: string, assetId: string | undefined, lang: string, today: string, hour: number): string {
  return JSON.stringify([lang, assetId ?? null, today, hour, message.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim()]);
}

export interface AssistantRoutesOptions {
  /** Null when no model is configured: the assistant answers 503 and reports itself unavailable. */
  model: ChatModel | null;
  repository: AssistantRepository;
}

export const assistantRoutes: FastifyPluginAsync<AssistantRoutesOptions> = async (app, { model, repository }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  let running = 0;
  // Insertion order is age order, so the first key is the oldest.
  const answers = new Map<string, { at: number; response: ChatResponse }>();

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
    const lang = resolveLang(body.lang, request.headers["accept-language"]);
    const today = turkeyToday();
    const hour = turkeyHour();
    // A position makes every question different, and is never kept.
    const key = body.history.length === 0 && !body.origin ? cacheKey(body.message, body.assetId, lang, today, hour) : null;
    const cached = key === null ? undefined : answers.get(key);
    reply.header("cache-control", "no-store");
    if (cached && Date.now() - cached.at < ANSWER_CACHE_MS) return cached.response;
    if (running >= MAX_CONCURRENT_CHATS) throw new HttpError(503, "ASSISTANT_BUSY", "The assistant is busy, retry in a moment");

    // Tools read our own routes as this client, so their requests count against its rate limit too.
    const api: ApiGet = async (path, query) => {
      const response = await app.inject({ method: "GET", url: path, query, remoteAddress: request.ip });
      return { statusCode: response.statusCode, body: response.json() };
    };

    running += 1;
    try {
      const result = await ask(
        model,
        { message: body.message, history: body.history, assetId: body.assetId, lang, today, hour, origin: body.origin },
        { api, repository },
        AbortSignal.timeout(CHAT_TIMEOUT_MS),
      );
      const response = ChatResponseSchema.parse({
        version: CONTRACT_VERSION,
        lang,
        answer: result.answer,
        citations: result.citations,
        grounded: result.citations.length > 0,
        attachments: { trip: result.trip, transit: result.transit },
        model: model.name,
      });
      if (key !== null) {
        answers.delete(key);
        answers.set(key, { at: Date.now(), response });
        if (answers.size > ANSWER_CACHE_SIZE) answers.delete(answers.keys().next().value!);
      }
      return response;
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
