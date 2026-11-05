import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import {
  fontFamily,
  palette,
  radius,
  spacing,
  Text,
  touchTarget,
  useTheme,
} from "@vagabonds/ui";
import { Link } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { BuildingIllustration } from "@/components/building-illustration";
import { yearOfDating } from "@/lib/dating";

/**
 * One asset in the gallery grid: a photo with its type on a small glass tag, then its name and
 * place under it. A real link (an `<a href>` on the web), so it can be opened in a new tab or
 * shared; announced once, as one link.
 */
export function AssetCard({ asset }: { asset: AssetSummary }) {
  const { colors: c } = useTheme();
  const [hovered, setHovered] = useState(false);
  const year = asset.yearLabel ?? yearOfDating(asset.datingDisplay);
  const meta = [asset.district, year].filter(Boolean).join(" · ");
  const label = [
    asset.name,
    asset.type.label,
    `${asset.district}, ${asset.city.label}`,
    asset.datingDisplay,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={{ pathname: "/monuments/[id]", params: { id: asset.id } }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        // On the web the card lifts a little under the pointer. One flat style: `Link asChild` takes neither a function nor an array.
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={StyleSheet.flatten([styles.card, Platform.OS === "web" && styles.cardWeb, hovered && styles.cardHover])}
      >
        <View style={[styles.photo, { backgroundColor: c.surfaceRaised }]}>
          {asset.cover ? (
            <AssetImage media={asset.cover} decorative fill />
          ) : (
            <BuildingIllustration mode="now" id={`card-${asset.id}`} />
          )}
          <Shade id={asset.id} />
          <View style={styles.tag}>
            <Text
              variant="caption"
              colorValue={palette.white}
              style={styles.tagText}
              numberOfLines={1}
            >
              {asset.type.label}
            </Text>
          </View>
          <View style={styles.go}>
            <Ionicons
              name="arrow-up-outline"
              size={14}
              color={palette.white}
              style={styles.goIcon}
            />
          </View>
        </View>

        <View style={styles.body}>
          <Text colorValue={c.text} style={styles.name} numberOfLines={2}>
            {asset.name}
          </Text>
          <Text
            variant="caption"
            colorValue={c.textSecondary}
            numberOfLines={1}
          >
            {meta}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

/** A soft dark edge at the top and bottom of the photo, so the glass tags always read. */
function Shade({ id }: { id: string }) {
  return (
    <View aria-hidden style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`card-shade-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.gece1000} stopOpacity={0.4} />
            <Stop offset="0.3" stopColor={palette.gece1000} stopOpacity={0} />
            <Stop offset="0.7" stopColor={palette.gece1000} stopOpacity={0} />
            <Stop offset="1" stopColor={palette.gece1000} stopOpacity={0.35} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#card-shade-${id})`} />
      </Svg>
    </View>
  );
}

const glass = {
  backgroundColor: "rgba(12, 14, 20, 0.45)",
  borderColor: "rgba(255, 255, 255, 0.18)",
  borderWidth: StyleSheet.hairlineWidth,
};

const styles = StyleSheet.create({
  card: {
    // Both columns share the row equally, whatever the length of the name.
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: touchTarget.min,
    gap: spacing.sm,
  },
  cardWeb: {
    transitionProperty: "transform",
    transitionDuration: "220ms",
  },
  cardHover: {
    transform: [{ translateY: -4 }],
  },
  photo: {
    aspectRatio: 4 / 5,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  tag: {
    ...glass,
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    maxWidth: "70%",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  tagText: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  go: {
    ...glass,
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  goIcon: {
    transform: [{ rotate: "45deg" }],
  },
  body: {
    gap: 2,
    paddingHorizontal: spacing.xxs,
  },
  name: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
});
