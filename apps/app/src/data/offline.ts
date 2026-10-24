import { useSyncExternalStore } from "react";

/**
 * Whether the screens show stored answers instead of fresh ones (./cached-source.ts),
 * and a "refresh" every data hook listens to. One store for the whole app: the banner
 * (components/offline-banner.tsx) reads it, the hooks (./hooks.ts) refetch on `refreshData`.
 */
interface OfflineState {
  /** When the oldest stored answer on screen was saved; `null` while everything is fresh. */
  since: number | null;
  /** Bumped by `refreshData`. */
  epoch: number;
}

let state: OfflineState = { since: null, epoch: 0 };
const listeners = new Set<() => void>();

function set(next: OfflineState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function markStale(savedAt: number) {
  if (state.since === null || savedAt < state.since) set({ ...state, since: savedAt });
}

export function markFresh() {
  if (state.since !== null) set({ ...state, since: null });
}

/** Refetches every data hook on screen. */
export function refreshData() {
  set({ ...state, epoch: state.epoch + 1 });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOfflineSince(): number | null {
  return useSyncExternalStore(subscribe, () => state.since, () => null);
}

export function useRefreshEpoch(): number {
  return useSyncExternalStore(subscribe, () => state.epoch, () => 0);
}
