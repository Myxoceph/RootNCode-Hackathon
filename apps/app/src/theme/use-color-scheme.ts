import { useColorScheme as useSystemColorScheme } from "react-native";

import type { ColorScheme } from "./theme-preference";

/** The device's scheme; light when the system has no preference. */
export function useColorScheme(): ColorScheme {
  return useSystemColorScheme() === "dark" ? "dark" : "light";
}
