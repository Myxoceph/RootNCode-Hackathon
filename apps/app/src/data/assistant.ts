import {
  ChatConversationResponseSchema,
  ChatConversationsResponseSchema,
  ChatResponseSchema,
  ChatStatusResponseSchema,
  type ChatConversation,
  type ChatConversationResponse,
  type ChatRequest,
  type ChatResponse,
} from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { accountToken, sessionRejected } from "./community";
import { resolveApiUrl, resolveDataSourceKind } from "./config";
import { DataError, type SchemaParser } from "./errors";
import { request, statusError, type RequestOptions } from "./http";
import { getMessages } from "@/i18n";

/**
 * AI asistan (`POST /chat`): questions about the sites, trips and local food, answered by a
 * language model from the API's own data. Only accounts ask; the API saves each conversation
 * (`/me/conversations`) and the app shows the one on its way (../lib/chat.ts). With the mock
 * source there is no model, so the entry points stay hidden.
 */
const assistantConfigured = resolveDataSourceKind() === "api";

/** The API allows 60 s per question (several model calls); a little more so its own answer arrives. */
const CHAT_TIMEOUT_MS = 65_000;
/** How long a status answer is trusted before the next screen asks again. */
const STATUS_TTL_MS = 5 * 60_000;

/** `null` until the first check answers. */
let available: boolean | null = assistantConfigured ? null : false;
let checkedAt: number | null = null;
let checking: Promise<void> | null = null;
const listeners = new Set<() => void>();

/**
 * Only the API's own answer is kept for `STATUS_TTL_MS`. A failed check (no network, a Wi-Fi
 * login page) or a model that just failed is not: the next screen that opens asks again.
 */
function setAvailable(next: boolean, trusted: boolean) {
  checkedAt = trusted ? Date.now() : null;
  if (next === available) return;
  available = next;
  listeners.forEach((listener) => listener());
}

/** Asks `GET /chat/status` once per `STATUS_TTL_MS`; until it answers, the entry points stay hidden. */
export function checkAssistant(): Promise<void> {
  if (!assistantConfigured) return Promise.resolve();
  if (checkedAt !== null && Date.now() - checkedAt < STATUS_TTL_MS) return Promise.resolve();
  checking ??= request(`${resolveApiUrl()}/chat/status`, ChatStatusResponseSchema)
    .then(
      (status) => setAvailable(status?.available ?? false, true),
      () => setAvailable(false, false),
    )
    .finally(() => {
      checking = null;
    });
  return checking;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function assistantAvailable(): boolean | null {
  return available;
}

/**
 * Whether a model answers: show the chat entry points only on `true`.
 * `null` while the first check is on its way.
 */
export function useAssistantAvailable(): boolean | null {
  useEffect(() => {
    void checkAssistant();
  }, []);
  return useSyncExternalStore(subscribe, assistantAvailable, assistantAvailable);
}


/** A request as the signed-in account; a 401 signs out on this device too. */
async function asAccount<T>(path: string, schema: SchemaParser<T>, options: Omit<RequestOptions, "token" | "errorFor"> = {}): Promise<T | null> {
  const token = await accountToken();
  if (token === null) throw new DataError("rejected", getMessages().rehber.signInError, [path], "ACCOUNT_REQUIRED");
  return request(`${resolveApiUrl()}${path}`, schema, {
    ...options,
    token,
    errorFor: (status, code, details) => {
      if (status === 401) sessionRejected(token);
      // The model stopped answering: hide the entry points, and let the next screen ask /chat/status again.
      if (code === "ASSISTANT_UNAVAILABLE") setAvailable(false, false);
      return chatError(status, code, details);
    },
  });
}

/**
 * Sends one question with the last turns; every failure is a `DataError` with a message to show.
 * `signal` cancels it, e.g. when the conversation is cleared.
 */
export async function askAssistant(body: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  // Never null: the API answers 200 with a body.
  return (await asAccount("/chat", ChatResponseSchema, { body, signal, timeoutMs: CHAT_TIMEOUT_MS }))!;
}

/** The account's conversations, last asked first (`GET /me/conversations`). */
export async function fetchConversations(): Promise<ChatConversation[]> {
  return (await asAccount("/me/conversations", ChatConversationsResponseSchema))!.items;
}

/** A conversation and its messages as they were shown (`GET /me/conversations/:id`). */
export async function fetchConversation(id: string): Promise<ChatConversationResponse> {
  return (await asAccount(`/me/conversations/${encodeURIComponent(id)}`, ChatConversationResponseSchema))!;
}

// The three below answer 204: the schema is never read.

/** "Yeni konuşma": the conversation becomes read-only and stays in the history. */
export async function archiveConversation(id: string): Promise<void> {
  await asAccount(`/me/conversations/${encodeURIComponent(id)}/archive`, ChatConversationsResponseSchema, { method: "POST" });
}

export async function deleteConversation(id: string): Promise<void> {
  await asAccount(`/me/conversations/${encodeURIComponent(id)}`, ChatConversationsResponseSchema, { method: "DELETE" });
}

export async function deleteAllConversations(): Promise<void> {
  await asAccount("/me/conversations", ChatConversationsResponseSchema, { method: "DELETE" });
}

/** What a conversation's error says; the code travels with it so the conversation can act on it. */
const CONVERSATION_MESSAGES: Record<string, string> = {
  get ACCOUNT_REQUIRED() {
    return getMessages().rehber.signInError;
  },
  get UNAUTHORIZED() {
    return getMessages().rehber.expired;
  },
  get CONVERSATION_ARCHIVED() {
    return getMessages().rehber.archivedError;
  },
  get CONVERSATION_FULL() {
    return getMessages().rehber.full;
  },
  get CONVERSATION_NOT_FOUND() {
    return getMessages().rehber.gone;
  },
};

export function chatError(status: number, code: string | null, details: string[]): DataError {
  const conversation = code ? CONVERSATION_MESSAGES[code] : undefined;
  if (conversation) return new DataError("rejected", conversation, details, code);
  if (code === "ASSISTANT_BUSY") {
    return new DataError("unavailable", getMessages().rehber.busy, details);
  }
  if (code === "ASSISTANT_UNAVAILABLE") {
    return new DataError("unavailable", getMessages().rehber.down, details);
  }
  if (status === 400) return new DataError("rejected", getMessages().errors.questionRejected, details);
  return statusError(status, code, details);
}
