import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { currentUserId, useCommunity } from "@/data/community";

/**
 * Both cities are kept per account (or session) on the device, as the map's tour and the unlocked
 * assets are: another account signing in on the same phone opens on its own map, never on the
 * city the last one left open. Without a session (no server, so no accounts) the phone's own.
 */
function keyFor(base: string, owner: string | null): string {
  return owner ? `${base}:${owner}` : base;
}

/** Before 2026-11-08 one city for the whole phone; removed, it belonged to no account. */
function dropShared(base: string): void {
  void AsyncStorage.removeItem(base).catch(() => {});
}

/** The city last opened on the map (`cities` code), kept for the next greeting. */
const KEY = "vagabonds-last-city";

/** Remembers the city just opened. A failed write only means the greeting falls back. */
export function rememberCity(code: string): void {
  void currentUserId()
    .then((owner) => AsyncStorage.setItem(keyFor(KEY, owner), code))
    .catch(() => {});
}

/** The city last opened on the map, read once; `null` when none was or it cannot be read. */
export async function readLastCity(): Promise<string | null> {
  const owner = await currentUserId().catch(() => null);
  return AsyncStorage.getItem(keyFor(KEY, owner)).catch(() => null);
}

/** The city last opened on the map; `null` when none was, `undefined` while it is being read. */
export function useLastCity(): string | null | undefined {
  return useStoredCity(KEY);
}

/**
 * The city the map was left open on (`cities` code), so the next visit opens there as it was left;
 * gone once the visitor goes back to the Turkey view.
 */
const OPEN_KEY = "vagabonds-open-city";

/** Keeps the city open now, or forgets it (`null`, back in the Turkey view). A failed write only means the map opens on Turkey. */
export function rememberOpenCity(code: string | null): void {
  void currentUserId()
    .then((owner) => {
      const key = keyFor(OPEN_KEY, owner);
      return code ? AsyncStorage.setItem(key, code) : AsyncStorage.removeItem(key);
    })
    .catch(() => {});
}

/** The city the map was left open on; `null` when it was left on Turkey, `undefined` while it is being read. */
export function useOpenCity(): string | null | undefined {
  return useStoredCity(OPEN_KEY);
}

/** The signed-in visitor's city under `base`: read again for another account, `undefined` until the session is known. */
function useStoredCity(base: string): string | null | undefined {
  const { user } = useCommunity();
  const owner = user === undefined ? undefined : (user?.id ?? null);
  const [stored, setStored] = useState<{ owner: string | null; city: string | null }>();
  useEffect(() => {
    if (owner === undefined) return;
    let active = true;
    if (owner !== null) dropShared(base);
    AsyncStorage.getItem(keyFor(base, owner)).then(
      (code) => active && setStored({ owner, city: code }),
      () => active && setStored({ owner, city: null }),
    );
    return () => {
      active = false;
    };
  }, [base, owner]);
  // What was read for the last account is not this one's: undefined until its own is read.
  return stored && stored.owner === owner ? stored.city : undefined;
}
