import { AccessibilityInfo, Platform } from "react-native";

/**
 * Speaks a message through the native screen reader (WCAG 4.1.3). On the web the
 * same message reaches screen readers through `role="alert"` or an `aria-live`
 * region instead, so this does nothing there and nothing is read twice.
 */
export function announce(message: string): void {
  if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(message);
}
