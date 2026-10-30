import type { ChatCitation, ChatResponse, ChatTurn } from "@vagabonds/contracts";
import { useSyncExternalStore } from "react";

import { askAssistant } from "@/data/assistant";
import { DataError } from "@/data/errors";

/** `POST /chat` takes at most this many earlier turns. */
export const HISTORY_TURNS = 6;
/** Longest question the API accepts (`ChatRequestSchema.message`). */
export const QUESTION_MAX = 500;
/** Longest turn the API accepts in the history (`ChatTurnSchema.content`). */
const TURN_MAX = 2000;

export type ChatEntry =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; response: ChatResponse };

export interface Conversation {
  entries: readonly ChatEntry[];
  /** The question on its way, shown as sent with "Yanıt hazırlanıyor…". */
  pending: string | null;
  /** The last question that failed and why; "Tekrar dene" sends it again. */
  failed: { question: string; message: string } | null;
}

/** A piece of an answer: plain text, or a `[n]` marker resolved to its source. */
export type AnswerPart = { kind: "text"; text: string } | { kind: "ref"; citation: ChatCitation };

/**
 * Splits an answer at its `[n]` markers. A marker without a citation is dropped: the API removes
 * those already, and a number pointing nowhere would only confuse.
 */
export function answerParts(answer: string, citations: readonly ChatCitation[]): AnswerPart[] {
  const byRef = new Map(citations.map((citation) => [citation.ref, citation]));
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of answer.matchAll(/\[(\d+)\]/g)) {
    const citation = byRef.get(Number(match[1]));
    if (match.index > last) parts.push({ kind: "text", text: answer.slice(last, match.index) });
    if (citation) parts.push({ kind: "ref", citation });
    last = match.index + match[0].length;
  }
  if (last < answer.length) parts.push({ kind: "text", text: answer.slice(last) });
  return parts;
}

/** The last turns for `POST /chat`, oldest first, each cut to what the API accepts. */
export function historyFor(entries: readonly ChatEntry[]): ChatTurn[] {
  return entries.slice(-HISTORY_TURNS).map((entry) => ({
    role: entry.role,
    content: (entry.role === "user" ? entry.text : entry.response.answer).slice(0, TURN_MAX),
  }));
}

/**
 * Conversations live in memory while the app is open, one per page they were started from
 * (`general`, or an asset id), so leaving the screen and coming back keeps them.
 */
const EMPTY: Conversation = { entries: [], pending: null, failed: null };
const conversations = new Map<string, Conversation>();
/** The question on its way in each conversation: its number and how to cancel it. */
const inFlight = new Map<string, { id: number; controller: AbortController }>();
const listeners = new Set<() => void>();
let nextId = 1;

function update(key: string, change: Partial<Conversation>) {
  conversations.set(key, { ...(conversations.get(key) ?? EMPTY), ...change });
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConversation(key: string): Conversation {
  return conversations.get(key) ?? EMPTY;
}

export function useConversation(key: string): Conversation {
  const read = () => getConversation(key);
  return useSyncExternalStore(subscribe, read, read);
}

/** Empties the conversation and cancels its question on the way, so the API is free for the next one. */
export function clearConversation(key: string) {
  inFlight.get(key)?.controller.abort();
  inFlight.delete(key);
  update(key, EMPTY);
}

/**
 * Asks one question in the conversation `key`. Resolves to the answer, or to `null` when it
 * failed (the reason is in `failed`) or another question is still on its way.
 */
export async function ask(key: string, question: string, assetId?: string): Promise<ChatResponse | null> {
  const before = conversations.get(key) ?? EMPTY;
  const text = question.trim();
  if (before.pending !== null || text.length === 0) return null;

  // Answers are matched by request, not by text: the same question asked again after "Temizle"
  // must not take the cancelled one's answer.
  const id = nextId++;
  const controller = new AbortController();
  const current = () => inFlight.get(key)?.id === id;
  inFlight.set(key, { id, controller });
  update(key, { pending: text, failed: null });
  try {
    const response = await askAssistant(
      { message: text, assetId, history: historyFor(before.entries), lang: "tr" },
      controller.signal,
    );
    if (!current()) return null;
    inFlight.delete(key);
    update(key, {
      entries: [...before.entries, { id: nextId++, role: "user", text }, { id: nextId++, role: "assistant", response }],
      pending: null,
    });
    return response;
  } catch (error) {
    if (!current()) return null;
    inFlight.delete(key);
    const message = error instanceof DataError ? error.message : "Soru gönderilemedi. Tekrar dene.";
    update(key, { pending: null, failed: { question: text, message } });
    return null;
  }
}
