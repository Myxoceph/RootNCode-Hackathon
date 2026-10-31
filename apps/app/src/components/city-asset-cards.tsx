import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, FlatList, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const MAX_CARD_WIDTH = 360;
/** How much of the next card shows, so the row reads as one to swipe. */
const PEEK = 48;
const PHOTO = 64;

interface CityAssetCardsProps {
  assets: AssetSummary[];
  /** How many of a complex's buildings it stands for on the map. */
  buildingsOf: ReadonlyMap<string, number>;
  selectedId: string | null;
  /** The card swiped to the middle. */
  onSelect: (id: string) => void;
}

/**
 * The open city's assets as a row of cards under the map, the chosen one in front:
 * swiping chooses the next asset (the map moves to it), choosing one on the map brings
 * its card here. The row rises in when it appears. A card opens the asset. The cards are clear frosted glass in every theme. For screen readers this row is the map's
 * content in words: every asset, a link each.
 */
export function CityAssetCards({ assets, buildingsOf, selectedId, onSelect }: CityAssetCardsProps) {
  const { scheme } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - spacing.lg * 2 - PEEK, MAX_CARD_WIDTH);
  const step = cardWidth + spacing.md;
  const list = useRef<FlatList<AssetSummary>>(null);
  const index = assets.findIndex((asset) => asset.id === selectedId);
  const reduceMotion = useReducedMotion();
  const [rise] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) rise.setValue(1);
    else Animated.timing(rise, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [rise, reduceMotion]);

  // A choice made on the map brings its card to the front.
  useEffect(() => {
    if (index >= 0) list.current?.scrollToOffset({ offset: index * step, animated: true });
  }, [index, step]);

  const onSwiped = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const swiped = assets[Math.round(event.nativeEvent.contentOffset.x / step)];
    if (swiped && swiped.id !== selectedId) onSelect(swiped.id);
  };

  return (
    <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
      <FlatList
        ref={list}
        horizontal
        data={assets}
        keyExtractor={(asset) => asset.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onMomentumScrollEnd={onSwiped}
        getItemLayout={(_, i) => ({ length: step, offset: step * i, index: i })}
        contentContainerStyle={styles.row}
        ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
        renderItem={({ item }) => <CityAssetCard asset={item} buildings={buildingsOf.get(item.id) ?? 0} width={cardWidth} chosen={item.id === selectedId} colors={CARD_COLORS[scheme]} />}
      />
    </Animated.View>
  );
}

interface CardColors {
  /** Behind the photo while it loads, and where there is none. */
  tile: string;
  text: string;
  textSecondary: string;
  /** Behind the type of place. */
  chip: string;
  /** The chosen card's edge, and the others' fainter. */
  mark: string;
  edge: string;
  /** The round "open" button: the seals' navy too. */
  button: string;
  onButton: string;
}

/**
 * Clear glass with white text in every theme: the map under it is always the night map.
 * The edges follow the theme: white in the light one, the seals' navy (`gece700`) in the dark one.
 */
const GLASS_COLORS = {
  tile: "rgba(255, 255, 255, 0.12)",
  text: palette.white,
  textSecondary: palette.gece200,
  chip: "rgba(255, 255, 255, 0.16)",
  button: palette.gece700,
  onButton: palette.white,
};
const CARD_COLORS: Record<"light" | "dark", CardColors> = {
  light: { ...GLASS_COLORS, mark: palette.white, edge: "rgba(255, 255, 255, 0.35)" },
  dark: { ...GLASS_COLORS, mark: palette.gece700, edge: "rgba(38, 50, 74, 0.6)" },
};

function CityAssetCard({ asset, buildings, width, chosen, colors }: { asset: AssetSummary; buildings: number; width: number; chosen: boolean; colors: CardColors }) {
  const router = useRouter();
  const place = [asset.district, buildings > 0 ? `${buildings} yapı` : null].filter(Boolean).join(" · ");
  const label = [asset.name, asset.type.label, asset.district, buildings > 0 ? `${buildings} yapısıyla` : null].filter(Boolean).join(", ");

  // Not a `Link asChild`: that throws on the style this card needs.
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => router.push({ pathname: "/monuments/[id]", params: { id: asset.id } })}
      style={({ pressed }) => [styles.card, { width, borderColor: chosen ? colors.mark : colors.edge }, pressed && styles.pressed]}
    >
      {/* Clear frosted glass: the night map shows through, blurred; the dark tint keeps white text readable over the fog. */}
      <BlurView intensity={50} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TINT }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS }]} />
      <View style={[styles.photo, { backgroundColor: colors.tile }]}>{asset.cover && <AssetImage media={asset.cover} decorative fill />}</View>
      <View style={styles.body}>
        <View style={styles.meta}>
          <View style={[styles.chip, { backgroundColor: colors.chip }]}>
            <Text variant="caption" colorValue={colors.text} numberOfLines={1} style={styles.chipText}>
              {asset.type.label}
            </Text>
          </View>
          {place.length > 0 && (
            <Text variant="caption" colorValue={colors.textSecondary} numberOfLines={1} style={styles.shrink}>
              {place}
            </Text>
          )}
        </View>
        <Text variant="label" colorValue={colors.text} numberOfLines={1} style={styles.name}>
          {asset.name}
        </Text>
      </View>
      <View style={[styles.open, { backgroundColor: colors.button }]}>
        <Ionicons name="arrow-forward" size={18} color={colors.onButton} />
      </View>
    </Pressable>
  );
}

/** A hint of the seals' navy in the glass, under a faint white sheen. */
const GLASS_TINT = "rgba(38, 50, 74, 0.3)";
const GLASS = "rgba(255, 255, 255, 0.1)";

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xs,
    paddingRight: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 2,
    overflow: "hidden",
  },
  pressed: {
    opacity: 0.85,
  },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  body: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.xxs,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
  },
  chipText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  shrink: {
    flexShrink: 1,
  },
  name: {
    fontFamily: fontFamily.sansBold,
  },
  open: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
