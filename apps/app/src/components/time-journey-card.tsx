import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { useLang, useMessages } from "@/i18n";
import { centuriesOf } from "@/lib/home";

/**
 * Zamanda Yolculuk's door on Eserler, under the search: three photos from the oldest, a middle
 * and the newest century fanned like cards, the span of centuries, and a line with a dot for each
 * of them. Quiet, as the page's own cards; the whole card opens the journey.
 */
export function TimeJourneyCard({ assets }: { assets: readonly AssetSummary[] }) {
  const { colors: c, scheme } = useTheme();
  const w = useMessages().journey;
  const lang = useLang();
  const router = useRouter();
  const centuries = useMemo(() => centuriesOf(assets, lang), [assets, lang]);
  if (centuries.length < 2) return null;

  const first = centuries[0]!;
  const last = centuries[centuries.length - 1]!;
  const middle = centuries[Math.floor(centuries.length / 2)]!;
  const photos = [first, middle, last].map((century) => century.assets[0]).filter((asset): asset is AssetSummary => Boolean(asset?.cover));
  const count = centuries.reduce((sum, century) => sum + century.assets.length, 0);
  const dark = scheme === "dark";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={w.cardLabel(first.roman, last.roman, centuries.length, count)}
      accessibilityHint={w.cardHint}
      onPress={() => router.push("/time-journey")}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: dark ? c.surfaceRaised : c.surface, borderColor: dark ? "rgba(255, 255, 255, 0.12)" : c.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.fan} aria-hidden>
        {photos.map((asset, i) => (
          <View
            key={asset.id}
            style={[
              styles.photo,
              { borderColor: dark ? c.surfaceRaised : c.surface, left: 6 + i * 22, zIndex: i, transform: [{ rotate: `${(i - 1) * 8}deg` }, { translateY: i === 1 ? -3 : 2 }] },
            ]}
          >
            <AssetImage media={asset.cover!} decorative fill />
          </View>
        ))}
      </View>

      <View style={styles.words}>
        <Text color="highlight" style={styles.overline}>
          {w.overline}
        </Text>
        <Text variant="label" numberOfLines={2} style={styles.title}>
          {w.span(first.roman, last.roman)}
        </Text>
        <View style={styles.timeline} aria-hidden>
          <View style={[styles.line, { backgroundColor: dark ? "rgba(221, 181, 92, 0.35)" : "rgba(156, 116, 36, 0.3)" }]} />
          {centuries.map((century, i) => (
            <View
              key={century.number}
              style={[
                styles.dot,
                { backgroundColor: c.highlightMark, opacity: 0.45 + 0.55 * Math.min(1, century.assets.length / 12) },
                (i === 0 || i === centuries.length - 1) && styles.dotEnd,
              ]}
            />
          ))}
        </View>
        <Text variant="caption" color="textSecondary" style={styles.count}>
          {w.counts(centuries.length, count)}
        </Text>
      </View>

      <View style={[styles.arrow, { backgroundColor: dark ? palette.altin300 : palette.gece950 }]}>
        <Ionicons name="arrow-forward" size={16} color={dark ? palette.gece950 : palette.altin200} />
      </View>
    </Pressable>
  );
}

const PHOTO_W = 50;
const PHOTO_H = 66;

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  fan: {
    width: PHOTO_W + 50,
    height: PHOTO_H + 8,
    justifyContent: "center",
  },
  photo: {
    position: "absolute",
    top: 4,
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: 10,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: palette.gece800,
  },
  words: {
    flex: 1,
    gap: 3,
  },
  overline: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2,
  },
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
    lineHeight: 21,
  },
  timeline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 12,
    marginTop: 2,
    marginRight: spacing.sm,
  },
  line: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotEnd: {
    width: 10,
    height: 10,
    borderRadius: 5,
    opacity: 1,
  },
  count: {
    fontSize: 12,
    lineHeight: 16,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
});
