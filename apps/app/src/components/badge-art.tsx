import { Image, StyleSheet, Text, View } from "react-native";

import { badgeArt } from "@/content/badge-art";

/** Whether an achievement has illustrated art; the rest draw their emoji. */
export function hasBadgeArt(code: string): boolean {
  return code in badgeArt;
}

/**
 * An achievement's face: its illustration when there is one (grey until earned), else its emoji.
 * Decorative: the name and state are spoken by whatever holds it.
 */
export function BadgeArt({ code, emoji, size, earned = true }: { code: string; emoji: string; size: number; earned?: boolean }) {
  const art = badgeArt[code];
  if (art) {
    return (
      <Image
        source={earned ? art.earned : art.locked}
        style={[{ width: size, height: size, borderRadius: size / 2 }, !earned && styles.faded]}
        accessibilityElementsHidden
        importantForAccessibility="no"
        aria-hidden
      />
    );
  }
  return (
    <View style={[styles.emoji, { width: size, height: size }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Text style={[{ fontSize: size * 0.6, lineHeight: size * 0.75 }, !earned && styles.faded]}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  emoji: {
    alignItems: "center",
    justifyContent: "center",
  },
  faded: {
    opacity: 0.55,
  },
});
