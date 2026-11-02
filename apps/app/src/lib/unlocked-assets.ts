import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

import { currentUserId, fetchMyVisits, useCommunity } from "@/data/community";

/**
 * The assets unlocked on the map: the signed-in visitor's visits (`GET /me/visits`, the same on
 * every device), and the ones "Kilidi aç" unlocked on this phone (a demo simulation of Ziyaret
 * Mührü, which the API cannot record without the visitor on site), kept per account. Another
 * account, or a signed-out visitor, on the same phone starts with the map locked.
 */
const demoKey = (userId: string) => `vagabonds-unlocked-assets:${userId}`;
/** Before 2026-11-03 one list for the whole phone; removed, it belonged to no account. */
const SHARED_KEY = "vagabonds-unlocked-assets";

/** Whose unlocks are loaded: an account or session id, null when signed out, undefined before the first load. */
let owner: string | null | undefined;
let visited: ReadonlySet<string> = new Set();
let demo: ReadonlySet<string> = new Set();
let unlocked: ReadonlySet<string> = new Set();
/** The owner's unlocks on their way: an unlock waits for them, so they cannot drop it when they arrive. */
let loading: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function publish() {
  unlocked = new Set([...visited, ...demo]);
  listeners.forEach((listener) => listener());
}

function loadFor(userId: string | null): Promise<void> {
  if (owner === userId) return loading;
  owner = userId;
  visited = new Set();
  demo = new Set();
  publish();
  void AsyncStorage.removeItem(SHARED_KEY).catch(() => {});
  loading = userId === null ? Promise.resolve() : load(userId);
  return loading;
}

async function load(userId: string): Promise<void> {
  const [visits, raw] = await Promise.all([
    fetchMyVisits().catch(() => null),
    AsyncStorage.getItem(demoKey(userId)).catch(() => null),
  ]);
  // Signed out or switched account while loading: those unlocks are someone else's.
  if (owner !== userId) return;
  // A seal made while they loaded stays unlocked.
  visited = new Set([...visited, ...(visits ?? []).map((visit) => visit.assetId)]);
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) demo = new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    // Unreadable: only the visits are unlocked.
  }
  publish();
}

/** A visit the API recorded (a sealed visit): unlocked at once, and from the API on the next launch. */
export function unlockAsset(id: string): void {
  if (visited.has(id)) return;
  visited = new Set([...visited, id]);
  publish();
}

/** "Kilidi aç", the demo simulation: kept for this account on this phone; signed out, for this run only. */
export async function unlockForDemo(id: string): Promise<void> {
  // Opened before the map ever was: load this account's unlocks first, or the next load would drop it.
  await loadFor(await currentUserId());
  if (demo.has(id)) return;
  demo = new Set([...demo, id]);
  publish();
  if (owner) void AsyncStorage.setItem(demoKey(owner), JSON.stringify([...demo])).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUnlockedAssets(): ReadonlySet<string> {
  const { user } = useCommunity();
  const userId = user === undefined ? undefined : (user?.id ?? null);
  useEffect(() => {
    // Wait until the stored session is read, or a signed-in visitor would flash a locked map.
    if (userId !== undefined) void loadFor(userId);
  }, [userId]);
  return useSyncExternalStore(
    subscribe,
    () => unlocked,
    () => unlocked,
  );
}
