import { colors } from "./colors";
import { useColorScheme } from "./use-color-scheme";

export { colors, type ColorRole, type ColorScheme } from "./colors";
export { useColorScheme } from "./use-color-scheme";

export function useColors() {
  return colors[useColorScheme()];
}
