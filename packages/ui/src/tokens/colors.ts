/**
 * Color tokens.
 *
 * `palette` holds the raw colors of the Hayrat visual identity. Screens never
 * use it directly: they go through a theme (`../themes.ts`), which maps these
 * values to roles like "text" and "background". Every foreground/background
 * combination a theme uses is checked by `npm run ui:contrast`.
 *
 * The 300 accents are tuned for dark surfaces, the 700 accents for light ones.
 * `altin600` is the gold of the design itself; on light surfaces it only
 * passes for icons and marks, so gold text there uses the darker `altin700`.
 */
export const palette = {
  white: "#FFFFFF",
  /** Light background; text on camera screens. */
  gece50: "#F5F7FA",
  /** Light raised surface (chips, tracks); text on dark themes. */
  gece100: "#E6EBF2",
  /** Light dividers and "tarih sisi" (the fog over undiscovered monuments). */
  gece200: "#D3DAE3",
  /** Secondary text on camera screens. */
  gece300: "#AEB6C4",
  /** Secondary text on dark themes. */
  gece400: "#96A2B6",
  /** Secondary text on light themes. */
  gece600: "#566174",
  /** Dark dividers and control borders. Not a text background. */
  gece700: "#26324A",
  /** Dark raised surface and the dark "tarih sisi". */
  gece800: "#1B2537",
  /** Dark surface; text on light themes. */
  gece900: "#141B29",
  /** Panels on camera screens. */
  gece925: "#111723",
  /** Dark background. */
  gece950: "#0D1420",
  /** Camera screens: always dark, whatever the theme. */
  gece1000: "#06080D",

  /** İznik kobaltı: primary action. */
  kobalt300: "#7FA3F1",
  kobalt700: "#1E4AA0",
  /** Firuze: open / confirmed, focus ring. */
  firuze300: "#4FC6BE",
  firuze700: "#0A7A76",
  /** Mercan: local food stops, warnings. */
  mercan300: "#EE7B64",
  mercan700: "#BE3A26",
  /** Varak altın: a resolved monument (the eight-pointed star on the map). */
  altin200: "#E7C26A",
  altin300: "#DDB55C",
  altin600: "#9C7424",
  altin700: "#82601B",
  /** Text on the camera screens' gold buttons. */
  altin950: "#1B1408",
} as const;

export type PaletteColor = keyof typeof palette;

/** WCAG 2.1 AA minimums: 1.4.3 (text) and 1.4.11 (icons, focus rings, control borders). */
export const MIN_CONTRAST = {
  text: 4.5,
  nonText: 3,
} as const;

export interface ContrastPair {
  foreground: PaletteColor;
  background: PaletteColor;
  /** "text" pairs must reach 4.5:1 even for large text; "nonText" pairs 3:1. */
  kind: keyof typeof MIN_CONTRAST;
  usage: string;
}
