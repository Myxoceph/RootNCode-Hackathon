import type { PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

import { radius, spacing } from "../tokens/spacing";
import { useTheme } from "./theme-context";

export interface CardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * A surface with a hairline border. Not pressable on its own: wrap it in a
 * `Link` or `Pressable` when the whole card opens something, so the card is
 * announced once as a link and not as a group of loose texts.
 */
export function Card({ style, children, ...rest }: PropsWithChildren<CardProps>) {
  const { colors } = useTheme();
  return (
    <View {...rest} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
