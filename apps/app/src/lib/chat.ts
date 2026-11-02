import type { ChatCitation, ChatConversation, ChatConversationResponse, ChatResponse, ChatTurn } from "@vagabonds/contracts";
import { useSyncExternalStore } from "react";

import { archiveConversation, askAssistant, fetchConversation, fetchConversations } from "@/data/assistant";
import { DataError } from "@/data/errors";
import { saveAdvice, saveTrip } from "@/lib/saved-routes";

/** `POST /chat` takes at most this many earlier turns. */
export const HISTORY_TURNS = 12;
/** Longest question the API accepts (`ChatRequestSchema.message`). */
export const QUESTION_MAX = 500;
/** Longest turn the API accepts in the history (`ChatTurnSchema.content`). */
const TURN_MAX = 2000;

export type ChatEntry = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; response: ChatResponse };

export interface Conversation {
  entries: readonly ChatEntry[];
  /** The question on its way, shown as sent with "Yanıt hazırlanıyor…". */
  pending: string | null;
  /** The last question that failed and why; "Tekrar dene" sends it again. */
  failed: { question: string; message: string } | null;
  /** The saved conversation the next question continues; null until the first answer. */
  conversationId: string | null;
  /** Opened from the history: read-only, no question goes to it. */
  archived: ChatConversation | null;
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

/** A piece of an answer line: text, bold or not, or a source marker. */
export type LinePart = { kind: "text"; text: string; bold: boolean } | { kind: "ref"; citation: ChatCitation };

/** A line of an answer: a paragraph, a list item with its bullet or number, or a blank line. */
export type AnswerLine = { kind: "paragraph" | "bullet"; parts: LinePart[] } | { kind: "number"; number: string; parts: LinePart[] } | { kind: "gap" };

/** `**bold**` spans of a text, as the model writes them. */
function boldSpans(text: string): LinePart[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((piece, i) => ({ kind: "text" as const, text: piece, bold: i % 2 === 1 }))
    .filter((piece) => piece.text.length > 0);
}

/**
 * An answer's lines, for showing it as chat apps do: the model writes lists with "- " or "1. ",
 * headings with "#" and emphasis with "**", and these come out as list items and bold text, not
 * as the marks themselves. A list item that starts with a short name and a colon ("Pideli Köfte:
 * ...") shows the name in bold, as the model means it.
 */
export function answerLines(parts: readonly AnswerPart[]): AnswerLine[] {
  const raw: AnswerPart[][] = [[]];
  for (const part of parts) {
    if (part.kind === "ref") {
      raw[raw.length - 1]!.push(part);
      continue;
    }
    part.text.split("\n").forEach((text, i) => {
      if (i > 0) raw.push([]);
      if (text) raw[raw.length - 1]!.push({ kind: "text", text });
    });
  }

  const lines: AnswerLine[] = [];
  for (const line of raw) {
    const first = line[0];
    if (!first || (line.length === 1 && first.kind === "text" && !first.text.trim())) {
      if (lines.length > 0 && lines[lines.length - 1]!.kind !== "gap") lines.push({ kind: "gap" });
      continue;
    }
    const head = first.kind === "text" ? first.text : "";
    const bullet = /^\s*[-*•]\s+/.exec(head);
    const number = /^\s*(\d+)[.)]\s+/.exec(head);
    const heading = /^\s*#{1,6}\s+/.exec(head);
    const lead = bullet ?? number ?? heading;
    const rest: AnswerPart[] = lead ? [{ kind: "text", text: head.slice(lead[0].length) }, ...line.slice(1)] : line;

    let out: LinePart[] = rest.flatMap((part): LinePart[] => (part.kind === "text" ? boldSpans(part.text) : [part]));
    if (heading) out = out.map((part) => (part.kind === "text" ? { ...part, bold: true } : part));
    const label = out[0];
    if ((bullet || number) && label?.kind === "text" && !label.bold && !out.some((part) => part.kind === "text" && part.bold)) {
      const colon = /^([^:]{2,40}):\s/.exec(label.text);
      if (colon)
        out = [
          { kind: "text", text: `${colon[1]}:`, bold: true },
          { kind: "text", text: label.text.slice(colon[1]!.length + 1), bold: false },
          ...out.slice(1),
        ];
    }

    if (number) lines.push({ kind: "number", number: number[1]!, parts: out });
    else lines.push({ kind: bullet ? "bullet" : "paragraph", parts: out });
  }
  while (lines[lines.length - 1]?.kind === "gap") lines.pop();
  return lines;
}

/** What a follow-up asks about. */
export type FollowUpTopic = "food" | "transit" | "weather" | "trip";

export interface FollowUp {
  topic: FollowUpTopic;
  /** What the pill says: short, so it stays on one line. */
  label: string;
  /** What is sent: the whole question, naming the site when there is one. */
  question: string;
}

/**
 * What to offer to ask next under an answer, as chat apps do: the steps a visit usually takes
 * after what was just answered. After a trip plan, where to eat on it and how to get around;
 * after a site, how to get there, what to eat nearby and a route around it; after food or the
 * weather, a trip that fits. A topic the answer already covers is not offered again. At most
 * three; none for general conversation.
 */
export function followUps(response: ChatResponse): FollowUp[] {
  const covered = new Set<string>(response.citations.map((citation) => citation.kind));
  if (response.attachments.trip) covered.add("trip");
  if (response.attachments.transit) covered.add("transit");
  const site = response.citations.find((citation) => citation.kind === "asset")?.title;

  let offers: FollowUp[];
  if (response.attachments.trip) {
    offers = [
      { topic: "food", label: "Öğle yemeğine ne önerirsin?", question: "Bu rotada öğle yemeği için ne önerirsin?" },
      { topic: "transit", label: "Toplu taşımayla nasıl giderim?", question: "Bu rotadaki duraklara toplu taşımayla nasıl giderim?" },
      { topic: "weather", label: "Gezi günü hava nasıl?", question: "Gezi günü hava nasıl olacak?" },
    ];
  } else if (site) {
    offers = [
      { topic: "transit", label: "Oraya nasıl giderim?", question: `${site} için toplu taşımayla nasıl giderim?` },
      { topic: "food", label: "Yakınında ne yenir?", question: `${site} yakınında ne yiyebilirim?` },
      { topic: "trip", label: "Çevresinde rota planla", question: `${site} çevresinde yarım günlük bir rota planla` },
    ];
  } else if (covered.has("dish")) {
    offers = [
      { topic: "trip", label: "Bu lezzetlerle rota planla", question: "Bu lezzetlerle yarım günlük bir gezi rotası planla" },
      { topic: "weather", label: "Hava gezmeye uygun mu?", question: "Bugün hava gezmeye uygun mu?" },
    ];
  } else if (covered.has("weather")) {
    offers = [
      { topic: "trip", label: "Bu havaya uygun rota planla", question: "Bu havaya uygun bir gezi rotası planla" },
      { topic: "food", label: "Bu havada ne yenir?", question: "Bu havada ne yemeli?" },
    ];
  } else {
    offers = [];
  }
  const kind: Record<FollowUpTopic, string> = { food: "dish", transit: "transit", weather: "weather", trip: "trip" };
  return offers.filter((offer) => !covered.has(kind[offer.topic])).slice(0, 3);
}

/** "Bugün", "Dün", "Bu hafta" or the month: how the history groups conversations, as chat apps do. */
export function dayGroup(iso: string, now = new Date()): string {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  if (days < 7) return "Bu hafta";
  return new Date(iso).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

/** The last turns for `POST /chat`, oldest first, each cut to what the API accepts. */
export function historyFor(entries: readonly ChatEntry[]): ChatTurn[] {
  return entries.slice(-HISTORY_TURNS).map((entry) => ({
    role: entry.role,
    content: (entry.role === "user" ? entry.text : entry.response.answer).slice(0, TURN_MAX),
  }));
}

/**
 * The conversation on each page lives in memory while the app is open, keyed by the account and
 * the page it was started from (`general`, or an asset id), so leaving the screen and coming back
 * keeps it; the API saves every question and answer, so after a restart `resumeConversation`
 * brings the page's open one back. An archived one opened from the history is `archive:<id>`.
 */
const EMPTY: Conversation = { entries: [], pending: null, failed: null, conversationId: null, archived: null };
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

/** The conversation's key: the account and the page, so another account on the phone never sees it. */
export function conversationKey(userId: string, assetId: string | undefined): string {
  return `${userId}:${assetId ?? "general"}`;
}

/** The key of an archived conversation opened from the history. */
export function archiveKey(conversationId: string): string {
  return `archive:${conversationId}`;
}

/** The messages as the chat shows them, each with an id of its own. */
function storedEntries(messages: ChatConversationResponse["messages"]): ChatEntry[] {
  return messages.map((message) =>
    message.role === "user" ? { id: nextId++, role: "user", text: message.text } : { id: nextId++, role: "assistant", response: message.response },
  );
}

/**
 * "Yeni konuşma": empties the page and cancels its question on the way, so the API is free for
 * the next one. The saved conversation is archived and stays in the history; if the API cannot
 * be reached it stays open there, and the next question archives it anyway.
 */
export function clearConversation(key: string) {
  const { conversationId } = getConversation(key);
  inFlight.get(key)?.controller.abort();
  inFlight.delete(key);
  update(key, EMPTY);
  if (conversationId) void archiveConversation(conversationId).catch(() => {});
}

/** Pages whose open conversation was already looked for, this run. */
const resumed = new Set<string>();

/**
 * Brings back the page's open conversation after a restart, once per run. Nothing changes if
 * the visitor asked something meanwhile, or the API cannot be reached.
 */
export async function resumeConversation(key: string, assetId: string | undefined): Promise<void> {
  if (resumed.has(key)) return;
  resumed.add(key);
  try {
    const open = (await fetchConversations()).find((item) => !item.archived && item.assetId === (assetId ?? null));
    if (!open) return;
    const { messages } = await fetchConversation(open.id);
    const now = getConversation(key);
    if (now.entries.length > 0 || now.pending !== null || now.conversationId !== null) return;
    update(key, { entries: storedEntries(messages), conversationId: open.id });
  } catch {
    // Starts empty; the conversation is still in the history.
  }
}

/** Opens a saved conversation from the history, read-only. Throws a `DataError` to show. */
export async function openArchived(conversationId: string): Promise<void> {
  const { conversation, messages } = await fetchConversation(conversationId);
  update(archiveKey(conversationId), { ...EMPTY, entries: storedEntries(messages), conversationId, archived: conversation });
}

/**
 * Asks one question in the conversation `key`. Resolves to the answer, or to `null` when it
 * failed (the reason is in `failed`) or another question is still on its way.
 */
export async function ask(key: string, question: string, assetId?: string, assetName?: string): Promise<ChatResponse | null> {
  const before = conversations.get(key) ?? EMPTY;
  const text = question.trim();
  if (before.pending !== null || before.archived !== null || text.length === 0) return null;

  // Answers are matched by request, not by text: the same question asked again after "Temizle"
  // must not take the cancelled one's answer.
  const id = nextId++;
  const controller = new AbortController();
  const current = () => inFlight.get(key)?.id === id;
  inFlight.set(key, { id, controller });
  update(key, { pending: text, failed: null });
  try {
    const response = await askAssistant(
      {
        message: text,
        assetId,
        history: historyFor(before.entries),
        lang: "tr",
        ...(before.conversationId && { conversationId: before.conversationId }),
      },
      controller.signal,
    );
    if (!current()) return null;
    inFlight.delete(key);
    // What Rehber plans or suggests goes to Profil · Kaydettiklerim; the answer says so (components/chat-message.tsx).
    if (response.attachments.trip) void saveTrip(response.attachments.trip);
    void saveAdvice(text, response, {
      asset: assetId && assetName ? { id: assetId, name: assetName } : undefined,
      trips: before.entries.flatMap((entry) => (entry.role === "assistant" && entry.response.attachments.trip ? [entry.response.attachments.trip] : [])),
    });
    update(key, {
      entries: [...before.entries, { id: nextId++, role: "user", text }, { id: nextId++, role: "assistant", response }],
      pending: null,
      conversationId: response.conversationId,
    });
    return response;
  } catch (error) {
    if (!current()) return null;
    inFlight.delete(key);
    const message = error instanceof DataError ? error.message : "Soru gönderilemedi. Tekrar dene.";
    // The saved conversation took no more questions (archived elsewhere, full, deleted): "Tekrar dene" starts a new one.
    const closed = error instanceof DataError && error.code?.startsWith("CONVERSATION_");
    update(key, { pending: null, failed: { question: text, message }, ...(closed && { conversationId: null }) });
    return null;
  }
}
