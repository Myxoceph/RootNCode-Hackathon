import { getTheme, UiProvider } from "@vagabonds/ui";
import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";

import { useColorScheme } from "@/theme/use-color-scheme";

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
}

const A11yContext = createContext<A11yContextValue>({ settings: defaultA11ySettings, setSetting: () => {} });

/**
 * Holds the settings for this session and hands the matching theme to the
 * design system. Not persisted yet: they reset when the app restarts.
 */
export function A11ySettingsProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const [settings, setSettings] = useState(defaultA11ySettings);

  const setSetting = useCallback<A11yContextValue["setSetting"]>((key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const ui = useMemo(
    () => ({
      theme: getTheme(scheme, settings.highContrast),
      textScale: settings.largeText ? LARGE_TEXT_SCALE : 1,
      strongFocusRing: settings.strongFocusRing,
    }),
    [scheme, settings.highContrast, settings.largeText, settings.strongFocusRing],
  );
  const value = useMemo(() => ({ settings, setSetting }), [settings, setSetting]);

  return (
    <A11yContext.Provider value={value}>
      <UiProvider value={ui}>{children}</UiProvider>
    </A11yContext.Provider>
  );
}

export function useA11ySettings(): A11yContextValue {
  return useContext(A11yContext);
}
