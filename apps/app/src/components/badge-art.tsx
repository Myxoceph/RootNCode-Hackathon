import { Image, Platform, StyleSheet, Text, View } from "react-native";

import { badgeArt } from "@/content/badge-art";
import { resolveApiUrl } from "@/data/config";

/**
 * Whether an achievement has a picture: one an admin uploaded (`imageUrl`) or illustrated art in
 * the app (assets/badges); the rest draw their emoji.
 */
export function hasBadgeArt(code: string, imageUrl?: string | null): boolean {
  return Boolean(imageUrl) || code in badgeArt;
}

/**
 * An achievement's face, in a circle: the picture an admin uploaded, else the app's illustrated
 * art (grey until earned), else its emoji. Decorative: the name and state are spoken by whatever
 * holds it.
 */
export function BadgeArt({ code, emoji, size, earned = true, imageUrl }: { code: string; emoji: string; size: number; earned?: boolean; imageUrl?: string | null }) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (imageUrl) {
    return (
      <Image
        source={{ uri: `${resolveApiUrl()}${imageUrl}` }}
        style={[circle, !earned && styles.faded, !earned && Platform.OS === "web" && webGrey]}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no"
        aria-hidden
      />
    );
  }
  const art = badgeArt[code];
  if (art) {
    return (
      <Image
        source={earned ? art.earned : art.locked}
        style={[circle, !earned && styles.faded]}
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

/** An uploaded picture has no grey copy: on the web a filter greys it; on a phone it is only faded. */
const webGrey = { filter: "grayscale(1)" } as object;

const styles = StyleSheet.create({
  emoji: {
    alignItems: "center",
    justifyContent: "center",
  },
  faded: {
    opacity: 0.55,
  },
});
