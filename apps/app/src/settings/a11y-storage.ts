import AsyncStorage from "@react-native-async-storage/async-storage";

import type { A11ySettings } from "./a11y-settings";

/** The accessibility switches, kept on the device (the site's storage on the web) so they survive a restart. */
const KEY = "vagabonds-a11y-settings";

/** The saved switches that are still switches; anything else in the store is left out. */
export function parseA11ySettings(raw: string | null, defaults: A11ySettings): Partial<A11ySettings> {
  if (!raw) return {};
  try {
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== "object") return {};
    const saved: Partial<A11ySettings> = {};
    for (const key of Object.keys(defaults) as Array<keyof A11ySettings>) {
      const value = (stored as Record<string, unknown>)[key];
      if (typeof value === "boolean") saved[key] = value;
    }
    return saved;
  } catch {
    return {};
  }
}

/** The saved switches; none when nothing is saved or the storage cannot be read. */
export async function readA11ySettings(defaults: A11ySettings): Promise<Partial<A11ySettings>> {
  try {
    return parseA11ySettings(await AsyncStorage.getItem(KEY), defaults);
  } catch {
    return {};
  }
}

/** Saves the switches. A failed write only means the next start opens with the defaults. */
export async function writeA11ySettings(settings: A11ySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // The switches still apply for this session.
  }
}
