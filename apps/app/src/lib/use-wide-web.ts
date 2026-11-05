import { spacing } from "@vagabonds/ui";
import { Platform, useWindowDimensions } from "react-native";

/** How wide a page's column grows on a wide web page (Profil and its pages), and its side room. */
export const WIDE_PAGE = 1040;
export const WIDE_PAGE_PADDING = spacing.xl;

/**
 * Whether this is a wide web page: there a page spreads to `WIDE_PAGE`, sets its cards more to a
 * row and its parts side by side. The phone and a narrow window keep the 560 column.
 */
export function useWideWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === "web" && width >= 900;
}

/** The column's style on a wide web page, over a page's own 560 one. */
export const wideColumn = {
  maxWidth: WIDE_PAGE,
  paddingHorizontal: WIDE_PAGE_PADDING,
} as const;
