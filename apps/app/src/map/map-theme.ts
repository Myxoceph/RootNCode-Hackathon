import { getTheme, useTheme, type Theme } from "@vagabonds/ui";
import { useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useCallback } from "react";

/**
 * The map is a night map in every theme: the dark theme's colors, keeping the
 * "Yüksek kontrast" setting. What lies over it (cards, bars) follows the app's theme.
 */
export function useMapTheme(): Theme {
  const app = useTheme();
  return getTheme("dark", app.name.endsWith("HighContrast"));
}

/** A screen the map fills to the top: light status bar text over the night map while it is in view. */
export function useMapStatusBar() {
  const { scheme } = useTheme();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle(scheme === "dark" ? "light" : "dark");
    }, [scheme]),
  );
}
