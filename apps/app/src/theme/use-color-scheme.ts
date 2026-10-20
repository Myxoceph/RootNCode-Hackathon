import { useColorScheme as useSystemColorScheme } from "react-native";

type ColorScheme = "light" | "dark";

/** The visual identity is dark first, so dark is the fallback when the system has no preference. */
export function useColorScheme(): ColorScheme {
  return useSystemColorScheme() === "light" ? "light" : "dark";
}
