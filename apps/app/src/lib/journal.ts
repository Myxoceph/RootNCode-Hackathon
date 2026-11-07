import { JOURNAL_PHOTOS_PER_ENTRY, type JournalEntry, type JournalLayout } from "@vagabonds/contracts";
import { useEffect, useSyncExternalStore } from "react";

import { currentUserId, useCommunity } from "@/data/community";
import { DataError } from "@/data/errors";
import { createJournalEntry, deleteJournalEntry, deleteJournalPhoto, fetchJournalPage, updateJournalEntry, uploadJournalPhoto } from "@/data/journal";
import { getMessages } from "@/i18n";

/** A photo chosen on this device. */
export interface PickedPhoto {
  /** Chosen here, so the page's layout can name the photo before it has arrived. */
  id: string;
  uri: string;
  width: number;
  height: number;
}

/** A photo on its way to an entry: shown from the device until the server's sizes are ready. */
export interface PendingPhoto extends PickedPhoto {
  entryId: string;
  status: "waiting" | "sending" | "failed";
  error: string | null;
}

export interface JournalState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  entries: readonly JournalEntry[];
  total: number;
  nextCursor: string | null;
  loadingMore: boolean;
  moreError: string | null;
  pending: readonly PendingPhoto[];
}

const EMPTY: JournalState = { status: "idle", error: null, entries: [], total: 0, nextCursor: null, loadingMore: false, moreError: null, pending: [] };

let state = EMPTY;
/** Whose journal is held: nothing of one account stays on screen for the next one on this phone. */
let owner: string | null | undefined;
/** A newer load or another account makes an answer on its way stale. */
let generation = 0;
let sending = false;
const listeners = new Set<() => void>();

function set(next: Partial<JournalState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getState = () => state;
/** The state as it is now, outside React. */
export const journalSnapshot = getState;

const messageOf = (error: unknown) => (error instanceof DataError ? error.message : getMessages().journal.errors.failed);

async function forOwner(): Promise<string | null> {
  const me = await currentUserId();
  if (me !== owner) {
    owner = me;
    generation += 1;
    state = EMPTY;
    listeners.forEach((listener) => listener());
  }
  return me;
}

/**
 * The first page, each time the journal opens: its photo paths are signed and expire, so these are
 * fresh ones. What is already on screen stays until they arrive.
 */
export async function openJournal(): Promise<void> {
  if ((await forOwner()) === null) return;
  const mine = ++generation;
  set({ status: state.entries.length > 0 ? "ready" : "loading", error: null, loadingMore: false });
  try {
    const page = await fetchJournalPage(null);
    if (mine !== generation) return;
    // An entry still waiting for its photos is not listed yet: it stays.
    const listed = new Set(page.items.map((entry) => entry.id));
    const waiting = state.entries.filter((entry) => !listed.has(entry.id) && state.pending.some((photo) => photo.entryId === entry.id));
    set({ status: "ready", entries: [...waiting, ...page.items], total: page.total + waiting.length, nextCursor: page.nextCursor, moreError: null });
  } catch (error) {
    if (mine !== generation) return;
    if (state.entries.length > 0) set({ status: "ready" });
    else set({ status: "error", error: messageOf(error) });
  }
}

export async function loadMoreJournal(): Promise<void> {
  const cursor = state.nextCursor;
  if (cursor === null || state.loadingMore) return;
  const mine = generation;
  set({ loadingMore: true, moreError: null });
  try {
    const page = await fetchJournalPage(cursor);
    if (mine !== generation) return;
    const known = new Set(state.entries.map((entry) => entry.id));
    set({ loadingMore: false, entries: [...state.entries, ...page.items.filter((entry) => !known.has(entry.id))], total: page.total, nextCursor: page.nextCursor });
  } catch (error) {
    if (mine === generation) set({ loadingMore: false, moreError: messageOf(error) });
  }
}

function replaceEntry(id: string, change: (entry: JournalEntry) => JournalEntry) {
  set({ entries: state.entries.map((entry) => (entry.id === id ? change(entry) : entry)) });
}

/** An entry with no text, no photo, no drawing and none on the way is nothing: it leaves the book, and the account. */
function dropIfEmpty(id: string) {
  const entry = state.entries.find((one) => one.id === id);
  if (!entry || entry.text !== null || entry.photos.length > 0 || (entry.layout?.strokes.length ?? 0) > 0 || (entry.layout?.stickers.length ?? 0) > 0 || state.pending.some((photo) => photo.entryId === id)) return;
  set({ entries: state.entries.filter((one) => one.id !== id), total: Math.max(0, state.total - 1) });
  deleteJournalEntry(id).catch(() => undefined);
}

/**
 * One photo at a time, without holding anything up: the visitor keeps reading and writing (ADR 0004).
 * Runs as long as the app does; leaving the journal's page does not stop it.
 */
async function pump() {
  if (sending) return;
  sending = true;
  try {
    for (;;) {
      const next = state.pending.find((photo) => photo.status === "waiting");
      if (!next) return;
      // Signed out or another account: what is left to send is not theirs to send.
      if ((await currentUserId()) !== owner) {
        set({ pending: [] });
        return;
      }
      const mark = (status: PendingPhoto["status"], error: string | null) =>
        set({ pending: state.pending.map((photo) => (photo.id === next.id ? { ...photo, status, error } : photo)) });
      mark("sending", null);
      try {
        const photo = await uploadJournalPhoto(next.entryId, next.id, next.uri, next.width, next.height);
        set({ pending: state.pending.filter((one) => one.id !== next.id) });
        replaceEntry(next.entryId, (entry) => ({ ...entry, photos: [...entry.photos, photo] }));
      } catch (error) {
        mark("failed", messageOf(error));
      }
    }
  } finally {
    sending = false;
  }
}

/** A random id. It names a photo and opens nothing: its file needs a signed path, its row its owner's token. */
export function newPhotoId(): string {
  const hex = (count: number) => Array.from({ length: count }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

function enqueue(entryId: string, photos: readonly PickedPhoto[]) {
  if (photos.length === 0) return;
  const added = photos.map((photo): PendingPhoto => ({ ...photo, entryId, status: "waiting", error: null }));
  set({ pending: [...state.pending, ...added] });
  void pump();
}

/** The photos an entry has room for, counting those on their way. */
export function photoRoom(entry: JournalEntry | null): number {
  if (!entry) return JOURNAL_PHOTOS_PER_ENTRY;
  const coming = state.pending.filter((photo) => photo.entryId === entry.id).length;
  return Math.max(0, JOURNAL_PHOTOS_PER_ENTRY - entry.photos.length - coming);
}

/** A new page. Answers as soon as the text is safe; its photos follow in the background. */
export async function addJournalEntry(text: string, photos: readonly PickedPhoto[], layout: JournalLayout | null = null): Promise<void> {
  await forOwner();
  const entry = await createJournalEntry(text.trim() || null, layout);
  set({ entries: [entry, ...state.entries], total: state.total + 1 });
  enqueue(entry.id, photos);
}

export async function editJournalEntry(entry: JournalEntry, text: string, added: readonly PickedPhoto[], removedPhotoIds: readonly string[], layout?: JournalLayout): Promise<void> {
  const trimmed = text.trim() || null;
  // Sent first, while the entry still has what it had: a failure here leaves the page as it was.
  if (trimmed !== entry.text || layout !== undefined) {
    const saved = await updateJournalEntry(entry.id, trimmed, layout);
    replaceEntry(entry.id, (current) => ({ ...current, text: saved.text, layout: saved.layout, updatedAt: saved.updatedAt }));
  }
  for (const id of removedPhotoIds) {
    await deleteJournalPhoto(id);
    replaceEntry(entry.id, (current) => ({ ...current, photos: current.photos.filter((photo) => photo.id !== id) }));
  }
  enqueue(entry.id, added);
  dropIfEmpty(entry.id);
}

export async function removeJournalEntry(id: string): Promise<void> {
  await deleteJournalEntry(id);
  set({
    entries: state.entries.filter((entry) => entry.id !== id),
    pending: state.pending.filter((photo) => photo.entryId !== id),
    total: Math.max(0, state.total - 1),
  });
}

export function retryJournalPhoto(id: string) {
  set({ pending: state.pending.map((photo) => (photo.id === id ? { ...photo, status: "waiting", error: null } : photo)) });
  void pump();
}

export function dropJournalPhoto(id: string) {
  const photo = state.pending.find((one) => one.id === id);
  set({ pending: state.pending.filter((one) => one.id !== id) });
  if (photo) dropIfEmpty(photo.entryId);
}

/** The journal of the signed-in account; opening it asks for fresh signed paths. */
export function useJournal(): JournalState {
  const { user } = useCommunity();
  const userId = user === undefined ? undefined : (user?.id ?? null);
  useEffect(() => {
    if (userId !== undefined) void openJournal();
  }, [userId]);
  const current = useSyncExternalStore(subscribe, getState, getState);
  // Before the effect above has run: another account's pages are never drawn, not even once.
  return userId === owner ? current : EMPTY;
}

/** What a book holds, page by page: a page for writing comes first, the newest entry after it. */
export type BookPage = { kind: "cover" } | { kind: "new" } | { kind: "entry"; entry: JournalEntry; number: number } | { kind: "more" };

export function bookPages(entries: readonly JournalEntry[], total: number, hasMore: boolean, withCover: boolean): BookPage[] {
  return [
    ...(withCover ? [{ kind: "cover" } as const] : []),
    { kind: "new" } as const,
    ...entries.map((entry, index) => ({ kind: "entry" as const, entry, number: Math.max(total - index, 1) })),
    ...(hasMore ? [{ kind: "more" } as const] : []),
  ];
}

/** The same question all day, another tomorrow. */
export function dailyPrompt(prompts: readonly string[], date: Date): string {
  const day = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  return prompts[day % prompts.length] ?? "";
}

/** How far a leaf must be lifted, or how fast flicked, to go over rather than fall back. */
const TURN_AT = 0.3;
const FLICK = 0.35;

/** Where a dragged leaf comes to rest. `progress` is how far it was dragged: forward above 0, back below. */
export function settleTurn(from: number, progress: number, velocityX: number, last: number): number {
  const direction = Math.sign(progress);
  // A flick counts only in the way the leaf is already going (a finger moving left turns forward).
  const flicked = -velocityX * direction > FLICK;
  const target = direction !== 0 && (Math.abs(progress) > TURN_AT || flicked) ? from + direction : from;
  return Math.max(0, Math.min(target, last));
}

/** A phone's page is this wide for its height, as a pocket journal is; two pages side by side, this. */
const PAGE_SHAPE = 0.64;
const SPREAD_SHAPE = 1.4;
const PAGE_MAX_WIDTH = 480;
const SPREAD_MAX_WIDTH = 1040;
const SPREAD_MIN_WIDTH = 640;

/**
 * The book's size in the room there is: always a book's shape, whole inside that room. Where the room
 * is wide (a wide web page, a phone on its side) it lies open on two pages.
 */
export function bookSize(roomWidth: number, roomHeight: number): { width: number; height: number; spread: boolean } {
  const spread = roomWidth >= SPREAD_MIN_WIDTH && roomWidth > roomHeight * 1.2;
  const shape = spread ? SPREAD_SHAPE : PAGE_SHAPE;
  const width = Math.min(roomWidth, spread ? SPREAD_MAX_WIDTH : PAGE_MAX_WIDTH);
  const height = Math.min(width / shape, roomHeight);
  return { width: Math.floor(Math.min(width, height * shape)), height: Math.floor(height), spread };
}
