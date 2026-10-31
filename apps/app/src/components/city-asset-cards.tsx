import type { AssetSummary } from "@vagabonds/contracts";
import { radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { AssetImage } from "@/components/asset-image";

const MAX_CARD_WIDTH = 360;
/** How much of the next card shows, so the row reads as one to swipe. */
const PEEK = 48;
const PHOTO = 84;

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
 * its card here. A card opens the asset. For screen readers this row is the map's
 * content in words: every asset, a link each.
 */
export function CityAssetCards({ assets, buildingsOf, selectedId, onSelect }: CityAssetCardsProps) {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - spacing.lg * 2 - PEEK, MAX_CARD_WIDTH);
  const step = cardWidth + spacing.md;
  const list = useRef<FlatList<AssetSummary>>(null);
  const index = assets.findIndex((asset) => asset.id === selectedId);
  const colors: CardColors = { surface: c.surface, tile: c.surfaceRaised, border: c.border, chosen: c.highlightMark };

  // A choice made on the map brings its card to the front.
  useEffect(() => {
    if (index >= 0) list.current?.scrollToOffset({ offset: index * step, animated: true });
  }, [index, step]);

  const onSwiped = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const swiped = assets[Math.round(event.nativeEvent.contentOffset.x / step)];
    if (swiped && swiped.id !== selectedId) onSelect(swiped.id);
  };

  return (
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
      renderItem={({ item }) => <CityAssetCard asset={item} buildings={buildingsOf.get(item.id) ?? 0} width={cardWidth} chosen={item.id === selectedId} colors={colors} />}
    />
  );
}

interface CardColors {
  surface: string;
  /** Behind the photo while it loads, and where there is none. */
  tile: string;
  border: string;
  /** The edge of the chosen card: the gold of its seal on the map. */
  chosen: string;
}

function CityAssetCard({ asset, buildings, width, chosen, colors }: { asset: AssetSummary; buildings: number; width: number; chosen: boolean; colors: CardColors }) {
  const router = useRouter();
  const kind = [asset.type.label, asset.district, buildings > 0 ? `${buildings} yapı` : null].filter(Boolean).join(" · ");
  const label = [asset.name, asset.type.label, asset.district, buildings > 0 ? `${buildings} yapısıyla` : null, asset.datingDisplay].filter(Boolean).join(", ");

  // Not a `Link asChild`: that throws on the style this card needs.
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => router.push({ pathname: "/monuments/[id]", params: { id: asset.id } })}
      style={({ pressed }) => [styles.card, { width, backgroundColor: colors.surface, borderColor: chosen ? colors.chosen : colors.border }, pressed && styles.pressed]}
    >
      <View style={[styles.photo, { backgroundColor: colors.tile }]}>{asset.cover && <AssetImage media={asset.cover} decorative fill />}</View>
      <View style={styles.body}>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {kind}
        </Text>
        <Text variant="label" numberOfLines={2}>
          {asset.name}
        </Text>
        {asset.datingDisplay && (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {asset.datingDisplay}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
  },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    paddingRight: spacing.xs,
  },
});
