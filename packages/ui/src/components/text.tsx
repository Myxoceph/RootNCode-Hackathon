import { Platform, Text as NativeText, type TextProps as NativeTextProps } from "react-native";

import type { ThemeRole } from "../themes";
import { typography, type TypographyVariant } from "../tokens/typography";
import { useUi } from "./theme-context";

export interface TextProps extends NativeTextProps {
  variant?: TypographyVariant;
  /** A theme role; defaults to `text`. */
  color?: ThemeRole;
  /** A raw color, for camera screens that ignore the theme. Wins over `color`. */
  colorValue?: string;
  /**
   * Makes the text a heading. Screen readers jump between headings; on the web
   * the level becomes `aria-level`, so a page reads as an outline (1 = page title).
   */
  headingLevel?: 1 | 2 | 3 | 4;
  /**
   * Language of this text when it differs from the app's Turkish, e.g. "ar"
   * for an inscription, so screen readers switch voice (WCAG 3.1.2). Sets
   * `accessibilityLanguage` on phones and `lang` on the web.
   */
  language?: string;
}

/**
 * Text in one of the typography variants, in a theme color.
 *
 * Follows the system text size (`allowFontScaling` stays on) and the in-app
 * "Büyük metin" setting.
 */
export function Text({ variant = "body", color = "text", colorValue, headingLevel, language, style, ...rest }: TextProps) {
  const { theme, textScale } = useUi();
  const base = typography[variant];
  const scaled = {
    ...base,
    fontSize: base.fontSize * textScale,
    lineHeight: base.lineHeight * textScale,
  };
  const heading = headingLevel
    ? { accessibilityRole: "header" as const, ...(Platform.OS === "web" ? ({ "aria-level": headingLevel } as object) : {}) }
    : {};
  const lang = language ? (Platform.OS === "web" ? ({ lang: language } as object) : { accessibilityLanguage: language }) : {};
  return <NativeText {...heading} {...lang} {...rest} style={[scaled, { color: colorValue ?? theme.colors[color] }, style]} />;
}
