import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

/**
 * The assets the visitor has unlocked on the map, on this device. For now "Kilidini aç" unlocks
 * an asset at once, standing in for a Ziyaret Mührü (a simulation for the demo).
 */
const KEY = "vagabonds-unlocked-assets";

let unlocked: ReadonlySet<string> = new Set();
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: ReadonlySet<string>) {
  unlocked = next;
  listeners.forEach((listener) => listener());
  void AsyncStorage.setItem(KEY, JSON.stringify([...next])).catch(() => {
    // Kept for this run only.
  });
}

function load(): Promise<void> {
  loaded ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        unlocked = new Set(parsed.filter((id): id is string => typeof id === "string"));
        listeners.forEach((listener) => listener());
      }
    } catch {
      // Unreadable: everything starts locked.
    }
  })();
  return loaded;
}

export async function unlockAsset(id: string): Promise<void> {
  await load();
  if (!unlocked.has(id)) set(new Set([...unlocked, id]));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUnlockedAssets(): ReadonlySet<string> {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => unlocked,
    () => unlocked,
  );
}
