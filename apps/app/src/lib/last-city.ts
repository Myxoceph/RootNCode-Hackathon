import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

/** The city last opened on the map (`cities` code), kept on the device for the next greeting. */
const KEY = "vagabonds-last-city";

/** Remembers the city just opened. A failed write only means the greeting falls back. */
export function rememberCity(code: string): void {
  void AsyncStorage.setItem(KEY, code).catch(() => {});
}

/** The city last opened on the map, read once; `null` when none was or it cannot be read. */
export async function readLastCity(): Promise<string | null> {
  return AsyncStorage.getItem(KEY).catch(() => null);
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
  void (code ? AsyncStorage.setItem(OPEN_KEY, code) : AsyncStorage.removeItem(OPEN_KEY)).catch(() => {});
}

/** The city the map was left open on; `null` when it was left on Turkey, `undefined` while it is being read. */
export function useOpenCity(): string | null | undefined {
  return useStoredCity(OPEN_KEY);
}

function useStoredCity(key: string): string | null | undefined {
  const [city, setCity] = useState<string | null>();
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(
      (code) => active && setCity(code),
      () => active && setCity(null),
    );
    return () => {
      active = false;
    };
  }, [key]);
  return city;
}
