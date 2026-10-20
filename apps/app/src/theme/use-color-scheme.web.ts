import { useEffect, useState } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

type ColorScheme = "light" | "dark";

/**
 * Web pages are rendered ahead of time without knowing the visitor's
 * preference, so the first client render must match that static HTML (dark)
 * before switching to the system scheme.
 */
export function useColorScheme(): ColorScheme {
  const [hydrated, setHydrated] = useState(false);
  const system = useSystemColorScheme();

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated && system === "light" ? "light" : "dark";
}
