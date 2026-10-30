export type ColorScheme = "light" | "dark";

/** The "Tema" choice on the Profil screen. "system" follows the device's light/dark setting. */
export type ThemePreference = ColorScheme | "system";

/** The app opens light; dark is a choice the user makes on the Profil screen. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export const themePreferenceOptions: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Aydınlık" },
  { value: "dark", label: "Koyu" },
  { value: "system", label: "Sistem" },
];

/** The scheme to show: the user's choice, or the device's when they picked "system". */
export function resolveColorScheme(preference: ThemePreference, system: ColorScheme): ColorScheme {
  return preference === "system" ? system : preference;
}
