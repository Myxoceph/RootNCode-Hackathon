import { useTheme, type ThemeColors } from "@vagabonds/ui";

export { useColorScheme } from "./use-color-scheme";
export * from "./theme-preference";
export * from "./theme-storage";

/** The current theme's color roles (light, dark or high contrast). */
export function useColors(): ThemeColors {
  return useTheme().colors;
}
