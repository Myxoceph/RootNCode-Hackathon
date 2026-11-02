import { Platform } from "react-native";

/**
 * The bottom padding a scroll view under a stack header leaves for the home indicator. On iOS
 * `contentInsetAdjustmentBehavior="automatic"` already adds it, so counting it again would
 * leave the room twice.
 */
export function bottomInset(safeAreaBottom: number): number {
  return Platform.OS === "ios" ? 0 : safeAreaBottom;
}
