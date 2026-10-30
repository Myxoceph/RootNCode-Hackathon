import {
  ChatResponseSchema,
  ChatStatusResponseSchema,
  type ChatRequest,
  type ChatResponse,
} from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { resolveApiUrl, resolveDataSourceKind } from "./config";
import { DataError } from "./errors";
import { request, statusError } from "./http";

/**
 * AI asistan (`POST /chat`): questions about the sites, trips and local food, answered by a
 * language model from the API's own data. The API is stateless; the app keeps the conversation
 * (../lib/chat.ts). With the mock source there is no model, so the entry points stay hidden.
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

/**
 * Sends one question with the last turns; every failure is a `DataError` with a message to show.
 * `signal` cancels it, e.g. when the conversation is cleared.
 */
export async function askAssistant(body: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  const answer = await request(`${resolveApiUrl()}/chat`, ChatResponseSchema, {
    body,
    signal,
    timeoutMs: CHAT_TIMEOUT_MS,
    errorFor: (status, code, details) => {
      // The model stopped answering: hide the entry points, and let the next screen ask /chat/status again.
      if (code === "ASSISTANT_UNAVAILABLE") setAvailable(false, false);
      return chatError(status, code, details);
    },
  });
  // Never null: `allowNotFound` is not set.
  return answer!;
}

export function chatError(status: number, code: string | null, details: string[]): DataError {
  if (code === "ASSISTANT_BUSY") {
    return new DataError("unavailable", "Asistan şu an başka sorulara bakıyor. Birkaç saniye sonra tekrar dene.", details);
  }
  if (code === "ASSISTANT_UNAVAILABLE") {
    return new DataError("unavailable", "Asistan şu an cevap veremiyor. Biraz sonra tekrar dene.", details);
  }
  if (status === 400) return new DataError("rejected", "Soru gönderilemedi. Soruyu değiştirip tekrar dene.", details);
  return statusError(status, code, details);
}
