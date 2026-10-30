import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

import { DEFAULT_THEME_PREFERENCE, themePreferenceOptions, type ThemePreference } from "./theme-preference";

/** The "Tema" choice, kept on the device (the site's storage on the web) so it survives a restart. */
const KEY = "vagabonds-theme-preference";

function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferenceOptions.some((option) => option.value === value);
}

/** The saved choice; the default when nothing is saved or the storage cannot be read. */
export async function readThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

/** Saves the choice. A failed write only means the next start opens with the default. */
export async function writeThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, preference);
  } catch {
    // The choice still applies for this session.
  }
}

/** The saved choice, or `undefined` while it is being read. */
export function useStoredThemePreference(): ThemePreference | undefined {
  const [preference, setPreference] = useState<ThemePreference>();

  useEffect(() => {
    let active = true;
    readThemePreference().then((stored) => {
      if (active) setPreference(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  return preference;
}
