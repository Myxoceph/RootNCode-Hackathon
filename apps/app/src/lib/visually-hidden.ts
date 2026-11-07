import type { TextStyle } from "react-native";

/**
 * Out of sight, still read: a page's title that the screen does not show (the tab bar or the
 * site's bar already names the page), kept as its heading for screen readers (WCAG 2.4.6).
 */
export const visuallyHidden: TextStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
};
