import { z } from "zod";
import { AssetIdSchema, ContractVersionSchema, LangSchema } from "./asset.schema";
import { TripPlanResponseSchema } from "./planner.schema";
import { TransitPlanResponseSchema } from "./transit.schema";

/**
 * AI asistan: questions about the sites, trip planning and local food (`POST /chat`).
 * The model answers only from the API's own data; every claim cites a numbered source.
 * Only signed-in accounts ask; their conversations are saved and listed (`/me/conversations`).
 */

/** One earlier turn of the conversation, sent by the app with each question. */
export const ChatTurnSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

/** Request body of `POST /chat`. */
export const ChatRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(500),
  /** Set when the question is asked from an asset's page ("Bu eser hakkında sor"). */
  assetId: AssetIdSchema.optional(),
  /** The last turns, oldest first; at most 12 (six questions and their answers). */
  history: z.array(ChatTurnSchema).max(12).default([]),
  /** Answer language; without it, Accept-Language, then Turkish. */
  lang: LangSchema.optional(),
  /** The visitor's position, when they allowed it; "how do I get there" starts from here. Never stored. */
  origin: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  /**
   * The open conversation this question continues, from an earlier answer's `conversationId`.
   * Without it the question starts a new conversation on its page, and the page's open one is archived.
   */
  conversationId: z.uuid().optional(),
});

/** What a citation points at; the app opens the asset or dish page for `asset` and `dish`. */
export const ChatCitationKindSchema = z.enum(["asset", "dish", "trip", "weather", "transit"]);

export const ChatCitationSchema = z.strictObject({
  /** The `[n]` marker in `answer`. */
  ref: z.int().positive(),
  kind: ChatCitationKindSchema,
  /** Asset id, dish id or city code. */
  id: z.string().min(1),
  title: z.string().min(1),
});

/** Response body of `POST /chat`. */
export const ChatResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  lang: LangSchema,
  /** Plain text with `[n]` markers; every marker has a citation. */
  answer: z.string().min(1),
  /** In `ref` order; only the sources the answer cites. */
  citations: z.array(ChatCitationSchema),
  /** False when the answer cites nothing: show it as general conversation, not as information about a site. */
  grounded: z.boolean(),
  attachments: z.strictObject({
    /** The plan behind a trip answer, for the Rotalar screen; null otherwise. */
    trip: TripPlanResponseSchema.nullable(),
    /** Bus and tram directions behind a "how do I get there" answer (Konya pilot), for the route map; null otherwise. */
    transit: TransitPlanResponseSchema.nullable().default(null),
  }),
  /** The model that wrote the answer, e.g. "qwen3:8b". */
  model: z.string().min(1),
  /** The conversation the question and answer were saved in; send it with the next question. Null when saving failed. */
  conversationId: z.uuid().nullable().default(null),
});

/** Response body of `GET /chat/status`: whether to show the assistant at all. */
export const ChatStatusResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  /** False when no model is configured or it does not answer; hide the chat entry points. */
  available: z.boolean(),
  /** Null when no model is configured. */
  model: z.string().min(1).nullable(),
});

/** A saved conversation, as `GET /me/conversations` lists it. */
export const ChatConversationSchema = z.strictObject({
  id: z.uuid(),
  /** The first question, cut to 80 characters. */
  title: z.string().min(1).max(80),
  /** The asset whose page it was asked from; null for Rehber. */
  assetId: AssetIdSchema.nullable(),
  assetName: z.string().min(1).nullable(),
  /** Questions and answers together. */
  messageCount: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  /** When the last question was asked. */
  updatedAt: z.iso.datetime(),
  /** Archived conversations are read-only: `POST /chat` refuses them (409 CONVERSATION_ARCHIVED). */
  archived: z.boolean(),
});

/** `GET /me/conversations`: the user's conversations, last asked first; at most `CHAT_CONVERSATIONS_KEPT`. */
export const ChatConversationsResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  items: z.array(ChatConversationSchema),
});

/** One message of a saved conversation: the question as asked, the answer as it was shown. */
export const ChatStoredMessageSchema = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("user"), text: z.string().min(1), createdAt: z.iso.datetime() }),
  z.strictObject({ role: z.literal("assistant"), response: ChatResponseSchema, createdAt: z.iso.datetime() }),
]);

/** `GET /me/conversations/:id`: the conversation and its messages, oldest first. */
export const ChatConversationResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  conversation: ChatConversationSchema,
  messages: z.array(ChatStoredMessageSchema),
});

/** Conversations kept per user; asking in a new one deletes the oldest beyond this. */
export const CHAT_CONVERSATIONS_KEPT = 50;
/** Messages per conversation (questions and answers); a fuller one asks for a new conversation (409 CONVERSATION_FULL). */
export const CHAT_CONVERSATION_MAX_MESSAGES = 100;

export type ChatTurn = z.infer<typeof ChatTurnSchema>;
export type ChatRequest = z.input<typeof ChatRequestSchema>;
export type ChatCitationKind = z.infer<typeof ChatCitationKindSchema>;
export type ChatCitation = z.infer<typeof ChatCitationSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type ChatStatusResponse = z.infer<typeof ChatStatusResponseSchema>;
export type ChatConversation = z.infer<typeof ChatConversationSchema>;
export type ChatConversationsResponse = z.infer<typeof ChatConversationsResponseSchema>;
export type ChatStoredMessage = z.infer<typeof ChatStoredMessageSchema>;
export type ChatConversationResponse = z.infer<typeof ChatConversationResponseSchema>;
