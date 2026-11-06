import { getTheme, UiProvider } from "@vagabonds/ui";
import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";

import {
  DEFAULT_THEME_PREFERENCE,
  resolveColorScheme,
  useColorScheme,
  writeThemePreference,
  type ThemePreference,
} from "@/theme";
import { useMessages } from "@/i18n";

/** The switches on the Profil screen (module 8). They apply to every screen at once. */
export interface A11ySettings {
  /** "Sesli mimari betimleme": shows the read-aloud buttons on camera screens. */
  audioDescription: boolean;
  /** Captions for the sound capsules. On by default. */
  captions: boolean;
  largeText: boolean;
  highContrast: boolean;
  strongFocusRing: boolean;
}

export const defaultA11ySettings: A11ySettings = {
  audioDescription: true,
  captions: true,
  largeText: false,
  highContrast: false,
  strongFocusRing: true,
};

/** "Büyük metin" makes every text 14% larger, on top of the system text size. */
const LARGE_TEXT_SCALE = 1.14;

interface A11yContextValue {
  settings: A11ySettings;
  setSetting: <K extends keyof A11ySettings>(key: K, value: A11ySettings[K]) => void;
  /** The "Tema" choice on the Profil screen. */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

const A11yContext = createContext<A11yContextValue>({
  settings: defaultA11ySettings,
  setSetting: () => {},
  themePreference: DEFAULT_THEME_PREFERENCE,
  setThemePreference: () => {},
});

interface A11ySettingsProviderProps extends PropsWithChildren {
  /** The theme choice saved on the device; `undefined` while it is being read (the web does not wait). */
  storedThemePreference?: ThemePreference;
}

/**
 * Holds the settings for this session and hands the matching theme to the design system.
 * The theme choice is saved on the device; the other switches reset when the app restarts.
 */
export function A11ySettingsProvider({ storedThemePreference, children }: A11ySettingsProviderProps) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState(defaultA11ySettings);
  const [chosenThemePreference, setChosenThemePreference] = useState<ThemePreference>();
  const themePreference = chosenThemePreference ?? storedThemePreference ?? DEFAULT_THEME_PREFERENCE;
  const scheme = resolveColorScheme(themePreference, systemScheme);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setChosenThemePreference(preference);
    void writeThemePreference(preference);
  }, []);

  const setSetting = useCallback<A11yContextValue["setSetting"]>((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const words = useMessages().ui;
  const ui = useMemo(
    () => ({
      words,
      theme: getTheme(scheme, settings.highContrast),
      textScale: settings.largeText ? LARGE_TEXT_SCALE : 1,
      strongFocusRing: settings.strongFocusRing,
    }),
    [words, scheme, settings.highContrast, settings.largeText, settings.strongFocusRing],
  );
  const value = useMemo(
    () => ({ settings, setSetting, themePreference, setThemePreference }),
    [settings, setSetting, themePreference, setThemePreference],
  );

  return (
    <A11yContext.Provider value={value}>
      <UiProvider value={ui}>{children}</UiProvider>
    </A11yContext.Provider>
  );
}

export function useA11ySettings(): A11yContextValue {
  return useContext(A11yContext);
}
