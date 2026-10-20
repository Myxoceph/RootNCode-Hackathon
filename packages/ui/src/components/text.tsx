import { Text as NativeText, type TextProps as NativeTextProps } from "react-native";

import type { ThemeRole } from "../themes";
import { typography, type TypographyVariant } from "../tokens/typography";
import { useUi } from "./theme-context";

export interface TextProps extends NativeTextProps {
  variant?: TypographyVariant;
  /** A theme role; defaults to `text`. */
  color?: ThemeRole;
  /** A raw color, for camera screens that ignore the theme. Wins over `color`. */
  colorValue?: string;
}

/**
 * Text in one of the typography variants, in a theme color.
 *
 * Follows the system text size (`allowFontScaling` stays on) and the in-app
 * "Büyük metin" setting. Headings still need `accessibilityRole="header"`.
 */
export function Text({ variant = "body", color = "text", colorValue, style, ...rest }: TextProps) {
  const { theme, textScale } = useUi();
  const base = typography[variant];
  const scaled = {
    ...base,
    fontSize: base.fontSize * textScale,
    lineHeight: base.lineHeight * textScale,
  };
  return <NativeText {...rest} style={[scaled, { color: colorValue ?? theme.colors[color] }, style]} />;
}
