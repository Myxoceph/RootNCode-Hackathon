/**
 * Typography tokens, in density-independent pixels (React Native units).
 *
 * Three families, each with one job:
 * - Hanken Grotesk: headings (semibold), interface and body text
 * - Amiri: Arabic calligraphy and the inscription layer
 * - IBM Plex Mono: years, times, coordinates
 *
 * The family names are the ones `@expo-google-fonts/*` registers. React Native
 * on Android picks a weight by family name, not by `fontWeight`, so every
 * weight is its own family here.
 *
 * Sizes are the base for the default system text size; the client must keep
 * `allowFontScaling` on so they follow the user's text size setting.
 * Nothing goes below 14: secondary text is still read on the move, outdoors.
 */
export const fontFamily = {
  display: "HankenGrotesk_600SemiBold",
  sans: "HankenGrotesk_400Regular",
  sansMedium: "HankenGrotesk_500Medium",
  sansSemiBold: "HankenGrotesk_600SemiBold",
  sansBold: "HankenGrotesk_700Bold",
  arabic: "Amiri_400Regular",
  arabicBold: "Amiri_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
} as const;

export const typography = {
  display: { fontFamily: fontFamily.display, fontSize: 36, lineHeight: 44 },
  title: { fontFamily: fontFamily.display, fontSize: 28, lineHeight: 36 },
  heading: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 30 },
  bodyLarge: { fontFamily: fontFamily.sans, fontSize: 18, lineHeight: 28 },
  body: { fontFamily: fontFamily.sans, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fontFamily.sansSemiBold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20 },
  /** Small section titles in capitals ("GÖRSEL KİMLİK"). */
  overline: { fontFamily: fontFamily.monoMedium, fontSize: 14, lineHeight: 20, letterSpacing: 2 },
  /** Years, times and coordinates ("1426 · 40.19°K"). */
  data: { fontFamily: fontFamily.mono, fontSize: 16, lineHeight: 24 },
  /** Original inscription text; Arabic script needs the taller line height. */
  inscription: { fontFamily: fontFamily.arabic, fontSize: 24, lineHeight: 44, writingDirection: "rtl" },
} as const;

export type FontFamily = keyof typeof fontFamily;
export type TypographyVariant = keyof typeof typography;
