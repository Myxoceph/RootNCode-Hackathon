import { getTheme, UiProvider } from "@vagabonds/ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Platform } from "react-native";

import {
  DEFAULT_THEME_PREFERENCE,
  resolveColorScheme,
  useColorScheme,
  writeThemePreference,
  type ThemePreference,
} from "@/theme";
import { useMessages } from "@/i18n";

import { readA11ySettings, writeA11ySettings } from "./a11y-storage";
import { applyFocusRing } from "./focus-ring";

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
 * Holds the settings and hands the matching theme to the design system. The theme choice and the
 * switches are saved on the device, so they are the same after a restart.
 */
export function A11ySettingsProvider({ storedThemePreference, children }: A11ySettingsProviderProps) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState(defaultA11ySettings);
  // A switch turned before the saved ones are read wins over them.
  const touched = useRef(new Set<keyof A11ySettings>());
  useEffect(() => {
    let active = true;
    readA11ySettings(defaultA11ySettings).then((saved) => {
      if (!active) return;
      setSettings((current) => {
        const next = { ...current };
        for (const key of Object.keys(saved) as Array<keyof A11ySettings>) {
          if (!touched.current.has(key)) next[key] = saved[key]!;
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, []);
  const [chosenThemePreference, setChosenThemePreference] = useState<ThemePreference>();
  const themePreference = chosenThemePreference ?? storedThemePreference ?? DEFAULT_THEME_PREFERENCE;
  const scheme = resolveColorScheme(themePreference, systemScheme);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setChosenThemePreference(preference);
    void writeThemePreference(preference);
  }, []);

  const setSetting = useCallback<A11yContextValue["setSetting"]>((key, value) => {
    touched.current.add(key);
    setSettings((current) => {
      const next = { ...current, [key]: value };
      void writeA11ySettings(next);
      return next;
    });
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
  // The web's focus ring follows the switch and the theme on every control, not only on Button.
  const ringColor = ui.theme.colors.focusRing;
  useEffect(() => {
    if (Platform.OS === "web") applyFocusRing(ringColor, settings.strongFocusRing);
  }, [ringColor, settings.strongFocusRing]);
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
