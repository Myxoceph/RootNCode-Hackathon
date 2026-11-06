import { createContext, useContext, type PropsWithChildren } from "react";

import { themes, type Theme } from "../themes";

/** The design system's own words; the app passes them in its language. */
export interface UiWords {
  confidence: string;
  infoKind: string;
  source: string;
  sources: string;
  noSource: string;
  pagesShort: string;
  pageSpoken: string;
}

const TURKISH: UiWords = {
  confidence: "Güven düzeyi",
  infoKind: "Bilgi türü",
  source: "Kaynak:",
  sources: "Kaynaklar:",
  noSource: "Kaynak belirtilmemiş",
  pagesShort: "s.",
  pageSpoken: "sayfa",
};

export interface UiSettings {
  theme: Theme;
  /** Turkish unless the app passes others. */
  words?: UiWords;
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

export function useUiWords(): UiWords {
  return useContext(UiContext).words ?? TURKISH;
}

export function useTheme(): Theme {
  return useContext(UiContext).theme;
}
