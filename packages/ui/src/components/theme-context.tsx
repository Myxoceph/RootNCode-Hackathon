import { createContext, useContext, type PropsWithChildren } from "react";

import { themes, type Theme } from "../themes";

export interface UiSettings {
  theme: Theme;
  /** "Büyük metin": multiplies every text size, on top of the system text size. */
  textScale: number;
  /** "Belirgin odak halkası": a thicker, offset ring on focused controls. */
  strongFocusRing: boolean;
}

const UiContext = createContext<UiSettings>({ theme: themes.dark, textScale: 1, strongFocusRing: true });

/** Wrap the app once; the app decides the theme from the system scheme and its settings. */
export function UiProvider({ value, children }: PropsWithChildren<{ value: UiSettings }>) {
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiSettings {
  return useContext(UiContext);
}

export function useTheme(): Theme {
  return useContext(UiContext).theme;
}
