/**
 * Typography tokens, in density-independent pixels (React Native units).
 *
 * Sizes are the base for the default system text size; the client must keep
 * `allowFontScaling` on so they follow the user's text size setting.
 * Nothing goes below 14: secondary text is still read on the move, outdoors.
 */
export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: fontWeight.bold },
  title: { fontSize: 24, lineHeight: 32, fontWeight: fontWeight.bold },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: fontWeight.semibold },
  bodyLarge: { fontSize: 18, lineHeight: 28, fontWeight: fontWeight.regular },
  body: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.regular },
  label: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.semibold },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.regular },
} as const;

export type TypographyVariant = keyof typeof typography;
