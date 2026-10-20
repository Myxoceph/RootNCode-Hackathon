import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

import { radius, spacing, touchTarget } from "../tokens/spacing";
import { Text } from "./text";
import { useUi } from "./theme-context";

export type ButtonVariant = "primary" | "ghost" | "success";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: ButtonVariant;
  /** Drawn before the label; hidden from screen readers, the label already says it. */
  icon?: ReactNode;
  /** Toggle buttons ("Rotaya ekle"): announced as selected / not selected. */
  selected?: boolean;
  /** Custom colors for camera screens: [background, label, border]. */
  colors?: [string, string, string?];
  style?: StyleProp<ViewStyle>;
}

/**
 * A button with its label as its accessible name, a 44pt minimum target and
 * a visible focus ring for keyboard and switch access.
 */
export function Button({ label, variant = "primary", icon, selected, colors, style, disabled, ...rest }: ButtonProps) {
  const { theme, strongFocusRing } = useUi();
  const [focused, setFocused] = useState(false);
  const c = theme.colors;

  const [background, foreground, border] =
    colors ??
    (variant === "ghost" && !selected
      ? ["transparent", c.text, c.border]
      : [variant === "primary" ? c.primary : c.success, c.onPrimary, "transparent"]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled ?? undefined, selected }}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      {...rest}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: border ?? "transparent" },
        pressed && styles.pressed,
        disabled && styles.disabled,
        focused && {
          outlineColor: c.focusRing,
          outlineStyle: "solid",
          outlineWidth: strongFocusRing ? 3 : 2,
          outlineOffset: strongFocusRing ? 3 : 1,
        },
        style,
      ]}
    >
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {icon}
        </View>
      ) : null}
      <Text variant="label" colorValue={foreground} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  label: {
    textAlign: "center",
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
});
