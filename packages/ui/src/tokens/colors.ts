/**
 * Color tokens.
 *
 * `palette` holds the raw colors. Screens never use it directly: they go
 * through a theme (K3), which maps these values to roles like "text" and
 * "background". Every foreground/background combination a theme may use is
 * listed in `contrastPairs` and checked by `npm run ui:contrast`.
 *
 * Inspiration: cut stone (stone), ink on paper (ink), İznik tiles (çini,
 * turkuaz), roof tiles (kiremit), gilding (okra) and garden courtyards (yeşil).
 * The 700 shades are for light surfaces, the 300 shades for dark surfaces.
 */
export const palette = {
  white: "#FFFFFF",
  stone50: "#FAF7F2",
  stone100: "#F2ECE2",
  stone300: "#CFC5B6",
  stone400: "#ADA191",
  ink600: "#5A5148",
  ink700: "#38322C",
  ink800: "#2A2622",
  ink900: "#1C1A17",

  cini300: "#8DB8DE",
  cini700: "#1F4E79",
  turkuaz300: "#6FC7C1",
  turkuaz700: "#0F5E5C",
  kiremit300: "#F0A08F",
  kiremit700: "#9A3324",
  okra300: "#E3B862",
  okra700: "#7A5410",
  yesil300: "#8FCB8C",
  yesil700: "#2F6131",
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

const lightSurfaces = ["stone50", "stone100", "white"] as const satisfies readonly PaletteColor[];
const darkSurfaces = ["ink900", "ink800", "ink700"] as const satisfies readonly PaletteColor[];

const lightText: Array<[PaletteColor, string]> = [
  ["ink900", "Primary text"],
  ["ink600", "Secondary text"],
  ["cini700", "Links, primary accent"],
  ["turkuaz700", "Secondary accent"],
  ["kiremit700", "Error"],
  ["okra700", "Warning"],
  ["yesil700", "Success"],
];

const darkText: Array<[PaletteColor, string]> = [
  ["stone50", "Primary text"],
  ["stone300", "Secondary text"],
  ["cini300", "Links, primary accent"],
  ["turkuaz300", "Secondary accent"],
  ["kiremit300", "Error"],
  ["okra300", "Warning"],
  ["yesil300", "Success"],
];

/** Every foreground/background combination the themes are allowed to use. */
export const contrastPairs: ContrastPair[] = [
  ...lightSurfaces.flatMap((background) =>
    lightText.map(([foreground, usage]) => ({ foreground, background, kind: "text" as const, usage })),
  ),
  ...darkSurfaces.flatMap((background) =>
    darkText.map(([foreground, usage]) => ({ foreground, background, kind: "text" as const, usage })),
  ),
  // Text on filled buttons and badges.
  { foreground: "white", background: "cini700", kind: "text", usage: "Primary button label" },
  { foreground: "white", background: "kiremit700", kind: "text", usage: "Destructive button label" },
  { foreground: "ink900", background: "cini300", kind: "text", usage: "Primary button label (dark)" },
  { foreground: "ink900", background: "kiremit300", kind: "text", usage: "Destructive button label (dark)" },
  // Focus ring and icons.
  { foreground: "cini700", background: "stone50", kind: "nonText", usage: "Focus ring, icons" },
  { foreground: "cini300", background: "ink900", kind: "nonText", usage: "Focus ring, icons (dark)" },
  { foreground: "stone50", background: "cini700", kind: "nonText", usage: "Focus ring on primary button" },
  { foreground: "ink900", background: "cini300", kind: "nonText", usage: "Focus ring on primary button (dark)" },
];
