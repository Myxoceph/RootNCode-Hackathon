import { palette, type ContrastPair, type PaletteColor } from "./tokens/colors";

/**
 * Themes map palette colors to roles. Screens only ever read roles
 * (`theme.colors.text`), so switching theme is a single value at the root.
 *
 * Each theme is written as role → palette key, so `themeContrastPairs` can
 * check every pair a theme actually uses (see `npm run ui:contrast`).
 */
const roles = [
  "background",
  "surface",
  /** Chips, segmented control tracks, switch tracks. */
  "surfaceRaised",
  "text",
  "textSecondary",
  "border",
  "primary",
  /** Label and icon on a filled `primary`, `success` or `warning` control. */
  "onPrimary",
  "success",
  "warning",
  /** Gold text: "çözüldü", the active tab underline's label. */
  "highlight",
  /** Gold marks: the eight-pointed star, map pins, the active tab underline. */
  "highlightMark",
  "focusRing",
  /** "Tarih sisi" over undiscovered parts of the map. */
  "fog",
  "mapBackground",
  "mapRoad",
  "mapRoadEdge",
  /** Outline of a province with assets on the Turkey map. */
  "mapProvince",
  /** Every other province border on the Turkey map: quiet, for orientation only. */
  "mapBorder",
] as const;

export type ThemeRole = (typeof roles)[number];
type ThemeSpec = Record<ThemeRole, PaletteColor>;

const lightSpec: ThemeSpec = {
  background: "gece50",
  surface: "white",
  surfaceRaised: "gece100",
  text: "gece900",
  textSecondary: "gece600",
  border: "gece200",
  primary: "kobalt700",
  onPrimary: "white",
  success: "gulkurusu700",
  warning: "mercan700",
  highlight: "altin700",
  highlightMark: "altin600",
  focusRing: "gulkurusu700",
  fog: "gece200",
  mapBackground: "gece50",
  mapRoad: "white",
  mapRoadEdge: "gece200",
  mapProvince: "gulkurusu500",
  mapBorder: "gece300",
};

const darkSpec: ThemeSpec = {
  background: "gece950",
  surface: "gece900",
  surfaceRaised: "gece800",
  text: "gece100",
  textSecondary: "gece400",
  border: "gece700",
  primary: "kobalt300",
  onPrimary: "gece950",
  success: "gulkurusu300",
  warning: "mercan300",
  highlight: "altin300",
  highlightMark: "altin300",
  focusRing: "gulkurusu300",
  fog: "gece800",
  mapBackground: "gece950",
  mapRoad: "gece700",
  mapRoadEdge: "gece1000",
  mapProvince: "altin300",
  mapBorder: "gece600",
};

/** High contrast: secondary text and borders take the full text color. */
function highContrast(spec: ThemeSpec, overrides: Partial<ThemeSpec> = {}): ThemeSpec {
  return { ...spec, textSecondary: spec.text, border: spec.text, ...overrides };
}

export const themeSpecs = {
  light: lightSpec,
  dark: darkSpec,
  lightHighContrast: highContrast(lightSpec, { mapProvince: "gulkurusu700", mapBorder: "gece600" }),
  darkHighContrast: highContrast(darkSpec, { mapBorder: "gece400" }),
} as const;

export type ThemeName = keyof typeof themeSpecs;
export type ThemeColors = Record<ThemeRole, string>;

export interface Theme {
  name: ThemeName;
  scheme: "light" | "dark";
  colors: ThemeColors;
}

function resolve(name: ThemeName): Theme {
  const spec = themeSpecs[name];
  const colors = Object.fromEntries(roles.map((role) => [role, palette[spec[role]]])) as ThemeColors;
  return { name, scheme: name.startsWith("light") ? "light" : "dark", colors };
}

export const themes: Record<ThemeName, Theme> = {
  light: resolve("light"),
  dark: resolve("dark"),
  lightHighContrast: resolve("lightHighContrast"),
  darkHighContrast: resolve("darkHighContrast"),
};

/** The one place a theme is picked: system scheme plus the "Yüksek kontrast" setting. */
export function getTheme(scheme: "light" | "dark", highContrastOn: boolean): Theme {
  if (scheme === "light") return highContrastOn ? themes.lightHighContrast : themes.light;
  return highContrastOn ? themes.darkHighContrast : themes.dark;
}

/**
 * Camera screens (Ziyaret Mührü, Taşın Dili, Ses Kapsülü) stay dark in every
 * theme, so the viewfinder reads the same in daylight and at night.
 */
const cameraSpec = {
  background: "gece1000",
  panel: "gece925",
  text: "gece50",
  textSecondary: "gece300",
  gold: "altin200",
  onGold: "altin950",
} as const satisfies Record<string, PaletteColor>;

export const cameraColors = Object.fromEntries(
  Object.entries(cameraSpec).map(([role, key]) => [role, palette[key]]),
) as Record<keyof typeof cameraSpec, string>;

/** Glass behind controls laid over the camera image. */
export const cameraGlass = "rgba(10,14,22,0.62)";

const textOn: Array<[ThemeRole, ThemeRole, string]> = [
  ["text", "background", "Primary text"],
  ["text", "surface", "Primary text on cards"],
  ["text", "surfaceRaised", "Chip labels"],
  ["textSecondary", "background", "Secondary text"],
  ["textSecondary", "surface", "Secondary text on cards"],
  ["primary", "background", "Links"],
  ["primary", "surface", "Links and active tab on cards"],
  ["success", "surface", "Open / confirmed"],
  ["warning", "surface", "Food stops, warnings"],
  ["warning", "background", "Warnings"],
  ["highlight", "surface", "Resolved monument label, legend badge"],
  ["highlight", "surfaceRaised", "Legend badge (filled)"],
  ["highlight", "background", "Legend badge on the page"],
  ["success", "background", "Certain badge on the page"],
  ["primary", "surfaceRaised", "Probable badge on chips"],
  ["onPrimary", "primary", "Primary button label"],
  ["onPrimary", "success", "Confirmed button label"],
  ["background", "text", "Selected chip (inverted)"],
];

const nonTextOn: Array<[ThemeRole, ThemeRole, string]> = [
  ["focusRing", "background", "Focus ring"],
  ["focusRing", "surface", "Focus ring on cards"],
  ["highlightMark", "surface", "Star, tab underline"],
  ["highlightMark", "mapBackground", "Star on the map"],
  ["mapProvince", "mapBackground", "Province with assets on the Turkey map"],
  ["primary", "surface", "Icons, switch thumb track"],
  ["success", "surfaceRaised", "Switch on"],
  ["textSecondary", "surface", "Control borders"],
];

const cameraPairs: ContrastPair[] = [
  { foreground: "gece50", background: "gece1000", kind: "text", usage: "Camera text" },
  { foreground: "gece50", background: "gece925", kind: "text", usage: "Camera panel text" },
  { foreground: "gece300", background: "gece925", kind: "text", usage: "Camera secondary text" },
  { foreground: "gece300", background: "gece1000", kind: "text", usage: "Camera secondary text" },
  { foreground: "altin200", background: "gece925", kind: "text", usage: "Inscription glow, gold labels" },
  { foreground: "altin950", background: "altin200", kind: "text", usage: "Gold button label" },
  { foreground: "altin200", background: "gece1000", kind: "nonText", usage: "Shutter ready, guides" },
];

/** Every foreground/background combination the themes use, without duplicates. */
export function themeContrastPairs(): ContrastPair[] {
  const seen = new Set<string>();
  const pairs: ContrastPair[] = [];
  const add = (pair: ContrastPair) => {
    const key = `${pair.foreground}/${pair.background}/${pair.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push(pair);
  };
  for (const [name, spec] of Object.entries(themeSpecs)) {
    for (const [fg, bg, usage] of textOn) {
      add({ foreground: spec[fg], background: spec[bg], kind: "text", usage: `${usage} (${name})` });
    }
    for (const [fg, bg, usage] of nonTextOn) {
      add({ foreground: spec[fg], background: spec[bg], kind: "nonText", usage: `${usage} (${name})` });
    }
  }
  cameraPairs.forEach(add);
  return pairs;
}
