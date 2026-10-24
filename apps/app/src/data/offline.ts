import { useSyncExternalStore } from "react";

/**
 * Which answers on screen are stored ones instead of fresh ones (./cached-source.ts), and
 * a "refresh" every data hook listens to. One store for the whole app: the banner
 * (components/offline-banner.tsx) reads it, the hooks (./hooks.ts) refetch on `refreshData`.
 */
export interface OfflineState {
  /** When the oldest stored answer shown was saved; `null` while everything is fresh. */
  since: number | null;
  /** Bumped by `refreshData`. */
  epoch: number;
}

let state: OfflineState = { since: null, epoch: 0 };
/** Answers shown from storage, by cache key, with when they were saved. */
const stale = new Map<string, number>();
const listeners = new Set<() => void>();

function set(next: OfflineState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function update() {
  const since = stale.size > 0 ? Math.min(...stale.values()) : null;
  if (since !== state.since) set({ ...state, since });
}

/** `key` was answered from storage. */
export function markStale(key: string, savedAt: number) {
  stale.set(key, savedAt);
  update();
}

/** `key` was answered by the network; other stored answers on screen keep the banner up. */
export function markFresh(key: string) {
  if (stale.delete(key)) update();
}

/**
 * Refetches every data hook on screen. The stored answers of screens no longer open are
 * forgotten; the refetch marks whatever is still answered from storage again.
 */
export function refreshData() {
  stale.clear();
  set({ since: null, epoch: state.epoch + 1 });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The store as it is now, outside React (tests). */
export function getOfflineState(): OfflineState {
  return state;
}

export function useOfflineSince(): number | null {
  return useSyncExternalStore(subscribe, () => getOfflineState().since, () => null);
}

export function useRefreshEpoch(): number {
  return useSyncExternalStore(subscribe, () => getOfflineState().epoch, () => 0);
}
