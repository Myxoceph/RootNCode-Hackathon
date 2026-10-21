import { palette } from "@vagabonds/ui";

/**
 * Temporary color roles until the design system ships its themes (K3).
 *
 * Every text/background combination here is one of the pairs checked by
 * `npm run ui:contrast` (packages/ui/src/tokens/colors.ts), so swapping this
 * file for the real themes later does not lower contrast anywhere.
 */
export const colors = {
  dark: {
    background: palette.gece950,
    surface: palette.gece900,
    text: palette.gece100,
    textSecondary: palette.gece400,
    primary: palette.kobalt300,
    /** Label on a filled `primary` button. */
    onPrimary: palette.gece900,
    warning: palette.mercan300,
    /** Varak altın: legends, highlights. */
    highlight: palette.altin300,
    border: palette.gece700,
  },
  light: {
    background: palette.gece50,
    surface: palette.white,
    text: palette.gece900,
    textSecondary: palette.gece600,
    primary: palette.kobalt700,
    onPrimary: palette.white,
    warning: palette.mercan700,
    highlight: palette.altin700,
    border: palette.gece100,
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorRole = keyof (typeof colors)["dark"];
