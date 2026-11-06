import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Achievement } from "@vagabonds/contracts";
import { useSyncExternalStore } from "react";

/**
 * The badges just earned, waiting to be celebrated (components/badge-celebration.tsx).
 *
 * A badge comes in from wherever it was earned: the answer of a sealed visit or of "Kilidi aç"
 * (`newAchievements`), or `GET /me/achievements`, which also awards the badges of notes approved
 * since. That answer does not say which are new, so the codes already shown are kept per account
 * on this device. The first time an account is seen here, everything it had earned counts as shown:
 * only badges earned from then on are celebrated.
 */

/** What the celebration shows of an achievement; `imageUrl` is the picture an admin uploaded, where the API sends one. */
export type NewBadge = Pick<Achievement, "code" | "title" | "description" | "badge" | "points"> & { imageUrl?: string | null };

const seenKey = (userId: string) => `vagabonds-badges-seen:${userId}`;

interface Seen {
  /** False until the account's earned badges have been read once on this device. */
  ready: boolean;
  codes: string[];
}

let queue: NewBadge[] = [];
/** While above zero the celebration waits; its badges stay in line. */
let holds = 0;
const NONE: NewBadge[] = [];
const listeners = new Set<() => void>();
/** Codes queued or shown in this run, so one badge is never celebrated twice. */
const celebrated = new Set<string>();

function publish() {
  for (const listener of listeners) listener();
}

async function readSeen(userId: string): Promise<Seen> {
  try {
    const raw = await AsyncStorage.getItem(seenKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Partial<Seen>) : null;
    return { ready: parsed?.ready === true, codes: Array.isArray(parsed?.codes) ? parsed.codes.filter((c): c is string => typeof c === "string") : [] };
  } catch {
    return { ready: false, codes: [] };
  }
}

async function writeSeen(userId: string, seen: Seen): Promise<void> {
  try {
    await AsyncStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch {
    // Not kept: at worst a badge is celebrated again after a restart.
  }
}

function enqueue(badges: NewBadge[]) {
  const fresh = badges.filter((badge) => !celebrated.has(badge.code));
  if (fresh.length === 0) return;
  for (const badge of fresh) celebrated.add(badge.code);
  queue = [...queue, ...fresh];
  publish();
}

/** Badges an answer says were just earned (a sealed visit, "Kilidi aç"): celebrated, and marked shown. */
export async function celebrateEarned(userId: string | null, badges: NewBadge[]): Promise<void> {
  if (badges.length === 0) return;
  enqueue(badges);
  if (!userId) return;
  const seen = await readSeen(userId);
  await writeSeen(userId, { ready: seen.ready, codes: [...new Set([...seen.codes, ...badges.map((b) => b.code)])] });
}

/**
 * The account's earned badges as `GET /me/achievements` has them: the ones not shown before are
 * celebrated. The first read on this device only takes note of them.
 */
export async function noteEarned(userId: string, earned: NewBadge[]): Promise<void> {
  const seen = await readSeen(userId);
  const known = new Set(seen.codes);
  const fresh = seen.ready ? earned.filter((badge) => !known.has(badge.code)) : [];
  if (seen.ready && fresh.length === 0) return;
  await writeSeen(userId, { ready: true, codes: [...new Set([...seen.codes, ...earned.map((b) => b.code)])] });
  enqueue(fresh);
}

/** The celebration done with the first badge in line. */
export function dismissBadge(): void {
  if (queue.length === 0) return;
  queue = queue.slice(1);
  publish();
}

/** Every badge waiting is put away at once ("Kapat" on the last, or leaving). */
export function dismissAllBadges(): void {
  if (queue.length === 0) return;
  queue = [];
  publish();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getQueue = () => (holds > 0 ? NONE : queue);

/** What the celebration may show now: nothing while it is held. */
export const heldBadges = getQueue;

/**
 * Keeps the celebration from opening, while a screen has its own moment on (a seal's sequence).
 * Returns what lets it go; the badges earned meanwhile then come in line.
 */
export function holdBadges(): () => void {
  holds++;
  publish();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    publish();
  };
}

/** The badges waiting, outside React. */
export const pendingBadges = (): NewBadge[] => queue;

/** The badges waiting to be celebrated, first in line first. */
export function useNewBadges(): NewBadge[] {
  return useSyncExternalStore(subscribe, getQueue, getQueue);
}
