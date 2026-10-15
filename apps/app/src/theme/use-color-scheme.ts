import { useColorScheme as useSystemColorScheme } from "react-native";

import type { ColorScheme } from "./colors";

/** The visual identity is dark first, so dark is the fallback when the system has no preference. */
export function useColorScheme(): ColorScheme {
  return useSystemColorScheme() === "light" ? "light" : "dark";
}
