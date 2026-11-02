import {
  CHAT_CONVERSATION_MAX_MESSAGES,
  ChatConversationResponseSchema,
  ChatConversationSchema,
  ChatConversationsResponseSchema,
  ChatRequestSchema,
  ChatResponseSchema,
  ChatStatusResponseSchema,
  CONTRACT_VERSION,
  LangSchema,
  type ChatConversation,
  type ChatConversationResponse,
  type ChatConversationsResponse,
  type ChatResponse,
  type ChatStatusResponse,
  type ChatStoredMessage,
  type Lang,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { pick, resolveLang } from "../../lib/lang.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository, UserRecord } from "../community/community.repository.ts";
import { turkeyHour, turkeyToday } from "../planner/planner.routes.ts";
import { ask } from "./assistant.ts";
import { ModelError, type ChatModel } from "./assistant.model.ts";
import type { AssistantRepository } from "./assistant.repository.ts";
import type { ApiGet } from "./assistant.tools.ts";
import type { ConversationRecord, ConversationsRepository, MessageRecord } from "./conversations.repository.ts";

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

/** Same question in other case or spacing. */
function cacheKey(message: string, assetId: string | undefined, lang: string, today: string): string {
  return JSON.stringify([lang, assetId ?? null, today, message.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim()]);
}

/**
 * Answers that change with the hour are kept only within it: an evening trip starts tomorrow, and a
 * route gives the next departures. Every other answer holds across the hour, so a question warmed
 * at 13:50 is still answered at once at 14:05.
 */
const hourBound = (response: ChatResponse) => response.attachments.trip !== null || response.attachments.transit !== null;

/** Whether a kept answer still answers the question asked now, at this hour (Türkiye). */
export function stillAnswers(kept: { at: number; hour: number; response: ChatResponse }, now: number, hour: number): boolean {
  return now - kept.at < ANSWER_CACHE_MS && (!hourBound(kept.response) || kept.hour === hour);
}

export interface AssistantRoutesOptions {
  /** Null when no model is configured: the assistant answers 503 and reports itself unavailable. */
  model: ChatModel | null;
  repository: AssistantRepository;
  community: CommunityRepository;
  conversations: ConversationsRepository;
}

const IdParamsSchema = z.object({ id: z.uuid() });
const LangQuerySchema = z.object({ lang: LangSchema.optional() });
const bearer = [{ bearerAuth: [] }];

/** Only accounts ask: an anonymous session (no username) is refused, so every conversation has an owner who can sign in again. */
async function requireAccount(request: FastifyRequest, community: CommunityRepository): Promise<UserRecord> {
  const user = await requireUser(request, community);
  if (user.username === null) throw new HttpError(403, "ACCOUNT_REQUIRED", "Sign in with an account to use the assistant");
  return user;
}

function toConversation(record: ConversationRecord, lang: Lang): ChatConversation {
  return ChatConversationSchema.parse({
    id: record.id,
    title: record.title,
    assetId: record.asset_id,
    assetName: record.asset ? pick(record.asset.name_tr, record.asset.name_en, lang) : null,
    messageCount: record._count.messages,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
    archived: record.archived_at !== null,
  });
}

/** An answer saved under an older contract that no longer parses is left out rather than failing the whole conversation. */
function toStoredMessage(record: MessageRecord): ChatStoredMessage | null {
  const createdAt = record.created_at.toISOString();
  if (record.role === "user") return { role: "user", text: record.content, createdAt };
  const response = ChatResponseSchema.safeParse(record.response);
  return response.success ? { role: "assistant", response: response.data, createdAt } : null;
}

export const assistantRoutes: FastifyPluginAsync<AssistantRoutesOptions> = async (app, { model, repository, community, conversations }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };
  let running = 0;
  // Insertion order is age order, so the first key is the oldest. Kept without a conversation id: each asker saves their own.
  const answers = new Map<string, { at: number; hour: number; response: ChatResponse }>();

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
      summary: "Asistana soru (yalnızca hesapla): cevap yalnızca veri setinden, kaynak numaralarıyla; soru ve cevap konuşmaya kaydedilir",
      security: bearer,
      body: toOpenApiSchema(ChatRequestSchema, "input"),
      response: {
        200: toOpenApiSchema(ChatResponseSchema),
        400: errorSchema,
        ...denied,
        404: errorSchema,
        409: errorSchema,
        429: errorSchema,
        503: errorSchema,
      },
    },
  }, async (request, reply): Promise<ChatResponse> => {
    // Visitors' questions are never logged; failures are, without the text. They are saved only in the asker's own conversations.
    const user = await requireAccount(request, community);
    const body = parseWith(ChatRequestSchema, request.body, "INVALID_BODY");
    if (!model) throw new HttpError(503, "ASSISTANT_UNAVAILABLE", "The assistant is not configured");
    const assetId = body.assetId ?? null;
    if (body.conversationId) {
      const conversation = await conversations.find(user.id, body.conversationId);
      if (conversation === null) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
      if (conversation.archived_at !== null) throw new HttpError(409, "CONVERSATION_ARCHIVED", "Archived conversations are read-only; start a new one");
      if (conversation.asset_id !== assetId) throw new HttpError(400, "CONVERSATION_PAGE_MISMATCH", "The conversation was started on another page");
      if (conversation._count.messages + 2 > CHAT_CONVERSATION_MAX_MESSAGES) {
        throw new HttpError(409, "CONVERSATION_FULL", "This conversation is full; start a new one");
      }
    }
    // A failed save keeps the answer: the visitor reads it now, and the next question starts a new conversation.
    const answered = async (response: ChatResponse): Promise<ChatResponse> => {
      let conversationId: string | null = null;
      try {
        conversationId = await conversations.saveTurn({
          userId: user.id,
          conversationId: body.conversationId ?? null,
          assetId,
          question: body.message,
          response,
        });
      } catch (err) {
        request.log.warn({ reason: err instanceof Error ? err.name : "unknown" }, "Chat turn not saved");
      }
      return { ...response, conversationId };
    };
    const lang = resolveLang(body.lang, request.headers["accept-language"]);
    const today = turkeyToday();
    const hour = turkeyHour();
    // A position makes every question different, and is never kept.
    const key = body.history.length === 0 && !body.origin ? cacheKey(body.message, body.assetId, lang, today) : null;
    const cached = key === null ? undefined : answers.get(key);
    reply.header("cache-control", "no-store");
    if (cached && stillAnswers(cached, Date.now(), hour)) return answered(cached.response);
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
        answers.set(key, { at: Date.now(), hour, response });
        if (answers.size > ANSWER_CACHE_SIZE) answers.delete(answers.keys().next().value!);
      }
      return await answered(response);
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

  app.get("/me/conversations", {
    schema: {
      tags: ["assistant"],
      summary: "Asistanla konuşmalarım (son sorulan önce); arşivdekiler yalnızca okunur",
      security: bearer,
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(ChatConversationsResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<ChatConversationsResponse> => {
    const user = await requireAccount(request, community);
    const query = parseWith(LangQuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);
    reply.header("cache-control", "no-store");
    return ChatConversationsResponseSchema.parse({
      version: CONTRACT_VERSION,
      items: (await conversations.list(user.id)).map((record) => toConversation(record, lang)),
    });
  });

  app.get("/me/conversations/:id", {
    schema: {
      tags: ["assistant"],
      summary: "Bir konuşmanın bütün soruları ve cevapları (eskiden yeniye), gösterildikleri gibi",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      querystring: toOpenApiSchema(LangQuerySchema, "input"),
      response: { 200: toOpenApiSchema(ChatConversationResponseSchema), 400: errorSchema, ...denied, 404: errorSchema },
    },
  }, async (request, reply): Promise<ChatConversationResponse> => {
    const user = await requireAccount(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const query = parseWith(LangQuerySchema, request.query, "INVALID_QUERY");
    const lang = resolveLang(query.lang, request.headers["accept-language"]);
    const conversation = await conversations.find(user.id, id);
    if (conversation === null) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    const messages = (await conversations.messages(id)).map(toStoredMessage).filter((message) => message !== null);
    reply.header("cache-control", "no-store");
    return ChatConversationResponseSchema.parse({ version: CONTRACT_VERSION, conversation: toConversation(conversation, lang), messages });
  });

  app.post("/me/conversations/:id/archive", {
    schema: {
      tags: ["assistant"],
      summary: "Konuşmayı arşive al (\"Yeni konuşma\"): artık soru gönderilmez, geçmişte kalır",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 204: { type: "null" }, 400: errorSchema, ...denied, 404: errorSchema },
    },
  }, async (request, reply) => {
    const user = await requireAccount(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    if (!(await conversations.archive(user.id, id))) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    return reply.code(204).send();
  });

  app.delete("/me/conversations/:id", {
    schema: {
      tags: ["assistant"],
      summary: "Konuşmayı sil",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 204: { type: "null" }, 400: errorSchema, ...denied, 404: errorSchema },
    },
  }, async (request, reply) => {
    const user = await requireAccount(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    if (!(await conversations.remove(user.id, id))) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    return reply.code(204).send();
  });

  app.delete("/me/conversations", {
    schema: {
      tags: ["assistant"],
      summary: "Bütün konuşmalarımı sil",
      security: bearer,
      response: { 204: { type: "null" }, ...denied },
    },
  }, async (request, reply) => {
    const user = await requireAccount(request, community);
    await conversations.removeAll(user.id);
    return reply.code(204).send();
  });
};
