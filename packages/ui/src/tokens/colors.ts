/**
 * Color tokens.
 *
 * `palette` holds the raw colors. Screens never use it directly: they go
 * through a theme (K3), which maps these values to roles like "text" and
 * "background". Every foreground/background combination a theme may use is
 * listed in `contrastPairs` and checked by `npm run ui:contrast`.
 *
 * The 300 accents and the gece neutrals are the visual identity as designed
 * (dark first). The 700 accents are the same hues darkened for light
 * surfaces (e.g. the camera controls bar), each at about 5.5:1 on gece50.
 */
export const palette = {
  white: "#FFFFFF",
  gece50: "#F3F5F9",
  gece100: "#E7EBF1",
  gece400: "#98A2B4",
  gece600: "#576378",
  /** Dividers and control borders on dark surfaces. Not a text background. */
  gece700: "#283248",
  /** "Tarih sisi": undiscovered monuments under the fog on the map. */
  gece800: "#1C2334",
  gece900: "#151B28",
  gece950: "#090D15",

  /** İznik kobaltı: primary action. */
  kobalt300: "#86A2EB",
  kobalt700: "#2658DB",
  /** Firuze: open / confirmed. */
  firuze300: "#71C3BD",
  firuze700: "#2E6D68",
  /** Mercan: local food stops, warnings. */
  mercan300: "#DF816A",
  mercan700: "#AA3F25",
  /** Varak altın: a resolved monument (the eight-pointed star on the map). */
  altin300: "#D7B76A",
  altin700: "#785F20",
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

const darkSurfaces = ["gece950", "gece900", "gece800"] as const satisfies readonly PaletteColor[];
const lightSurfaces = ["gece50", "white"] as const satisfies readonly PaletteColor[];

const darkText: Array<[PaletteColor, string]> = [
  ["gece100", "Primary text"],
  ["gece400", "Secondary text, captions"],
  ["kobalt300", "Primary action, links"],
  ["firuze300", "Open / confirmed"],
  ["mercan300", "Food stops, warnings"],
  ["altin300", "Resolved monument, highlights"],
];

const lightText: Array<[PaletteColor, string]> = [
  ["gece900", "Primary text"],
  ["gece600", "Secondary text, captions"],
  ["kobalt700", "Primary action, links"],
  ["firuze700", "Open / confirmed"],
  ["mercan700", "Food stops, warnings"],
  ["altin700", "Resolved monument, highlights"],
];

/** Every foreground/background combination the themes are allowed to use. */
export const contrastPairs: ContrastPair[] = [
  ...darkSurfaces.flatMap((background) =>
    darkText.map(([foreground, usage]) => ({ foreground, background, kind: "text" as const, usage })),
  ),
  ...lightSurfaces.flatMap((background) =>
    lightText.map(([foreground, usage]) => ({ foreground, background, kind: "text" as const, usage })),
  ),
  // Text on filled buttons and badges.
  { foreground: "gece900", background: "kobalt300", kind: "text", usage: "Primary button label" },
  { foreground: "gece900", background: "mercan300", kind: "text", usage: "Warning badge label" },
  { foreground: "gece900", background: "altin300", kind: "text", usage: "Resolved badge label" },
  { foreground: "white", background: "kobalt700", kind: "text", usage: "Primary button label (light)" },
  { foreground: "white", background: "mercan700", kind: "text", usage: "Warning badge label (light)" },
  // Focus ring, icons and map markers.
  { foreground: "kobalt300", background: "gece900", kind: "nonText", usage: "Focus ring, icons" },
  { foreground: "kobalt700", background: "gece50", kind: "nonText", usage: "Focus ring, icons (light)" },
  { foreground: "gece900", background: "kobalt300", kind: "nonText", usage: "Focus ring on primary button" },
  { foreground: "altin300", background: "gece700", kind: "nonText", usage: "Resolved-monument star on the map" },
  { foreground: "gece400", background: "gece900", kind: "nonText", usage: "Control borders" },
];
