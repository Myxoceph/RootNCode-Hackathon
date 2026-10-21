import Ionicons from "@expo/vector-icons/Ionicons";
import { cameraColors, cameraGlass, fontFamily, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

/** A round glass icon button over the camera image. */
export function GlassIconButton({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={cameraColors.text} />
    </Pressable>
  );
}

/** Top bar of a camera screen: back, a title card, and optional extra buttons. */
export function CameraTopBar({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={styles.topBar}>
      <GlassIconButton icon="chevron-back" label="Geri" onPress={() => (router.canGoBack() ? router.back() : router.navigate("/camera"))} />
      <View style={styles.title}>
        <Text variant="heading" colorValue={cameraColors.text} headingLevel={1} numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.mono}>
          {subtitle}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconButton: {
    width: touchTarget.min,
    height: touchTarget.min,
    borderRadius: touchTarget.min / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: cameraGlass,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    flex: 1,
    minWidth: 0,
    backgroundColor: cameraGlass,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
});
