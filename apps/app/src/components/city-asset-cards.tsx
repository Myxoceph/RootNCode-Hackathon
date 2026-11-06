import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary } from "@vagabonds/contracts";
import { fontFamily, palette, radius, spacing, Text, useTheme } from "@vagabonds/ui";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, FlatList, Platform, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { AssetImage } from "@/components/asset-image";
import { isAssetUnlocked } from "@/lib/related-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useMessages } from "@/i18n";

const MAX_CARD_WIDTH = 360;
/** How much of the next card shows, so the row reads as one to swipe. */
const PEEK = 48;
const PHOTO = 64;

interface CityAssetCardsProps {
  assets: AssetSummary[];
  /** How many of a complex's buildings it stands for on the map. */
  buildingsOf: ReadonlyMap<string, number>;
  selectedId: string | null;
  /** The assets out of the fog on the map. */
  unlocked: ReadonlySet<string>;
  /** The card swiped to the middle, or chosen with a screen reader's "Seç". */
  onSelect: (id: string) => void;
  /** "Kilidini aç" on a locked card: the map's own button, for those who cannot see the map. */
  onUnlock: (id: string) => void;
}

/**
 * The open city's assets as a row of cards under the map, the chosen one in front:
 * swiping chooses the next asset (the map moves to it), choosing one on the map brings
 * its card here. The row rises in when it appears. A card opens the asset, and says so: "İncele". The cards are clear frosted glass in every theme. For screen readers this row is the map's
 * content in words: every asset, a link each.
 */
export function CityAssetCards({ assets, buildingsOf, selectedId, unlocked, onSelect, onUnlock }: CityAssetCardsProps) {
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
        renderItem={({ item }) => (
          <CityAssetCard
            asset={item}
            buildings={buildingsOf.get(item.id) ?? 0}
            width={cardWidth}
            chosen={item.id === selectedId}
            opened={isAssetUnlocked(item, unlocked)}
            colors={CARD_COLORS[scheme]}
            onSelect={() => onSelect(item.id)}
            onUnlock={() => onUnlock(item.id)}
          />
        )}
      />
    </Animated.View>
  );
}

/** A row of the side panel: the photo, the words and "İncele". */
const LIST_ROW = 80;
const LIST_GAP = spacing.sm;

/**
 * The open city's assets on a wide web page: a column in the map's side panel instead of the row
 * of cards to swipe. A click on an asset chooses it (the map flies to it); its "İncele" opens it.
 * Choosing on the map scrolls its row into sight. For screen readers it is the map's content in
 * words, as the cards are: every asset a button to choose, with its "İncele" link after it.
 * `onHide` folds the panel away; the map page offers it back.
 */
export function CityAssetList({ title, assets, buildingsOf, selectedId, unlocked, onSelect, onHide }: Omit<CityAssetCardsProps, "onUnlock"> & { title: string; onHide: () => void }) {
  const look = LIST_LOOKS[useTheme().scheme];
  const m = useMessages();
  const list = useRef<FlatList<AssetSummary>>(null);
  const index = assets.findIndex((asset) => asset.id === selectedId);
  const [height, setHeight] = useState(0);

  // A third of the way down the panel, never above the first row.
  useEffect(() => {
    if (index >= 0 && height > 0) list.current?.scrollToOffset({ offset: Math.max(0, index * (LIST_ROW + LIST_GAP) - height * 0.3), animated: true });
  }, [index, height]);

  return (
    <View style={styles.listWrap}>
      <View style={styles.listHead}>
        <View style={styles.listTitleRow}>
          <Text variant="label" colorValue={look.text} headingLevel={2} style={styles.listTitle}>
            {title}
          </Text>
          <Text variant="caption" colorValue={look.textSecondary}>
            {m.search.count(assets.length)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.cards.hideList}
          onPress={onHide}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.hide, { backgroundColor: hovered ? look.hover : look.row }, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={18} color={look.text} />
        </Pressable>
      </View>
      <FlatList
        ref={list}
        data={assets}
        keyExtractor={(asset) => asset.id}
        getItemLayout={(_, i) => ({ length: LIST_ROW + LIST_GAP, offset: (LIST_ROW + LIST_GAP) * i, index: i })}
        ItemSeparatorComponent={ListGap}
        contentContainerStyle={styles.listContent}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        style={styles.flex}
        renderItem={({ item }) => (
          <CityAssetRow
            asset={item}
            buildings={buildingsOf.get(item.id) ?? 0}
            chosen={item.id === selectedId}
            opened={isAssetUnlocked(item, unlocked)}
            onSelect={onSelect}
            look={look}
          />
        )}
      />
    </View>
  );
}

function ListGap() {
  return <View style={{ height: LIST_GAP }} />;
}

/** One row of the side panel; drawn again only when its own asset, choice or seal changes. */
const CityAssetRow = memo(function CityAssetRow({ asset, buildings, chosen, opened, onSelect, look }: { asset: AssetSummary; buildings: number; chosen: boolean; opened: boolean; onSelect: (id: string) => void; look: ListLook }) {
  const router = useRouter();
  const m = useMessages();
  const place = [asset.district, buildings > 0 ? m.cards.buildings(buildings) : null].filter(Boolean).join(" · ");
  return (
    <View style={styles.listRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[asset.name, asset.type.label, place, opened ? m.cards.discovered : m.cards.undiscovered].filter(Boolean).join(", ")}
        accessibilityHint={m.cards.showOnMap}
        accessibilityState={{ selected: chosen }}
        aria-pressed={chosen}
        onPress={() => onSelect(asset.id)}
        style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.listChoose,
          {
            borderColor: chosen ? look.gold : hovered ? look.edgeHover : look.edge,
            backgroundColor: chosen ? look.chosen : hovered ? look.hover : look.row,
          },
        ]}
      >
        <View style={[styles.listPhoto, { backgroundColor: look.tile }]}>{asset.cover && <AssetImage media={asset.cover} decorative fill />}</View>
        <View style={styles.body}>
          <View style={styles.meta}>
            <View style={[styles.chip, { backgroundColor: look.chip }]}>
              <Text variant="caption" colorValue={look.text} numberOfLines={1} style={styles.chipText}>
                {asset.type.label}
              </Text>
            </View>
            {place.length > 0 && (
              <Text variant="caption" colorValue={look.textSecondary} numberOfLines={1} style={styles.shrink}>
                {place}
              </Text>
            )}
          </View>
          <View style={styles.meta}>
            {!opened && <Ionicons name="lock-closed" size={12} color={look.textSecondary} aria-hidden />}
            <Text variant="label" colorValue={look.text} numberOfLines={1} style={[styles.name, styles.shrink]}>
              {asset.name}
            </Text>
          </View>
        </View>
      </Pressable>
      {/* Beside the row's button, not in it: one control is never inside another. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={m.cards.openLabel(asset.name)}
        onPress={() => router.push({ pathname: "/monuments/[id]", params: { id: asset.id } })}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.listOpen,
          { backgroundColor: chosen ? look.gold : hovered ? look.buttonHover : look.button },
          pressed && styles.pressed,
        ]}
      >
        <Text variant="caption" colorValue={chosen ? look.onGold : look.text} style={styles.openText}>
          {m.cards.open}
        </Text>
        <Ionicons name="arrow-forward" size={14} color={chosen ? look.onGold : look.text} />
      </Pressable>
    </View>
  );
});

/**
 * The side panel in each theme: white with night words in the light one, night with ivory words in
 * the dark one. The chosen row is edged in gold and its "İncele" filled with it: the light theme's
 * gold is the app's tab gold, dark enough for white words (4.57:1, AA).
 */
export const LIST_LOOKS = {
  light: {
    panel: palette.white,
    panelEdge: "rgba(11, 15, 24, 0.08)",
    shadow: "0 14px 34px -16px rgba(5, 8, 14, 0.35)",
    text: palette.gece950,
    textSecondary: palette.gece600,
    row: "rgba(11, 15, 24, 0.035)",
    hover: "rgba(11, 15, 24, 0.07)",
    edge: "rgba(11, 15, 24, 0.06)",
    edgeHover: "rgba(11, 15, 24, 0.14)",
    chosen: "rgba(150, 111, 34, 0.08)",
    tile: "rgba(11, 15, 24, 0.06)",
    chip: "rgba(11, 15, 24, 0.07)",
    button: "rgba(11, 15, 24, 0.06)",
    buttonHover: "rgba(11, 15, 24, 0.12)",
    gold: "#966F22",
    onGold: palette.white,
  },
  dark: {
    panel: "#16181E",
    panelEdge: "rgba(255, 255, 255, 0.07)",
    shadow: "0 12px 32px -12px rgba(0, 0, 0, 0.55)",
    text: palette.white,
    textSecondary: palette.gece200,
    row: "rgba(255, 255, 255, 0.03)",
    hover: "rgba(255, 255, 255, 0.06)",
    edge: "rgba(255, 255, 255, 0.06)",
    edgeHover: "rgba(255, 255, 255, 0.16)",
    chosen: "rgba(231, 194, 106, 0.08)",
    tile: "rgba(255, 255, 255, 0.12)",
    chip: "rgba(255, 255, 255, 0.16)",
    button: "rgba(255, 255, 255, 0.08)",
    buttonHover: "rgba(255, 255, 255, 0.16)",
    gold: "#E7C26A",
    onGold: "#0B0F18",
  },
} as const;
type ListLook = (typeof LIST_LOOKS)[keyof typeof LIST_LOOKS];

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
export const GLASS_COLORS = {
  tile: "rgba(255, 255, 255, 0.12)",
  text: palette.white,
  textSecondary: palette.gece200,
  chip: "rgba(255, 255, 255, 0.16)",
  button: palette.gece700,
  onButton: palette.white,
};
export const CARD_COLORS: Record<"light" | "dark", CardColors> = {
  light: { ...GLASS_COLORS, mark: palette.white, edge: "rgba(255, 255, 255, 0.35)" },
  dark: { ...GLASS_COLORS, mark: palette.gece700, edge: "rgba(38, 50, 74, 0.6)" },
};

interface CityAssetCardProps {
  asset: AssetSummary;
  buildings: number;
  width: number;
  chosen: boolean;
  /** Out of the fog: said on the card, as the map shows it. */
  opened: boolean;
  colors: CardColors;
  onSelect: () => void;
  onUnlock: () => void;
}

function CityAssetCard({ asset, buildings, width, chosen, opened, colors, onSelect, onUnlock }: CityAssetCardProps) {
  const router = useRouter();
  const m = useMessages();
  const place = [asset.district, buildings > 0 ? m.cards.buildings(buildings) : null].filter(Boolean).join(" · ");
  const label = [asset.name, asset.type.label, asset.district, buildings > 0 ? m.cards.withBuildings(buildings) : null, opened ? m.cards.discovered : m.cards.undiscovered]
    .filter(Boolean)
    .join(", ");
  // Swiping and the map choose an asset; a screen reader chooses it here, and unlocks it as the map's button does.
  const actions = [...(chosen ? [] : [{ name: "select", label: m.cards.select }]), ...(opened ? [] : [{ name: "unlock", label: m.cards.unlock }])];

  // Not a `Link asChild`: that throws on the style this card needs.
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={m.cards.openHint}
      // The chosen card is the one the buttons under the search are for.
      accessibilityState={{ selected: chosen }}
      // The web has no "selected" for a link: the chosen card is the current one there.
      aria-current={chosen ? "true" : undefined}
      accessibilityActions={actions}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "select") onSelect();
        else if (nativeEvent.actionName === "unlock") onUnlock();
      }}
      onPress={() => router.push({ pathname: "/monuments/[id]", params: { id: asset.id } })}
      style={({ pressed }) => [styles.card, { width, borderColor: chosen ? colors.mark : colors.edge }, pressed && styles.pressed]}
    >
      <GlassFill />
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
        <View style={styles.meta}>
          {!opened && <Ionicons name="lock-closed" size={12} color={colors.textSecondary} aria-hidden accessibilityElementsHidden importantForAccessibility="no" />}
          <Text variant="label" colorValue={colors.text} numberOfLines={1} style={[styles.name, styles.shrink]}>
            {asset.name}
          </Text>
        </View>
      </View>
      <View style={[styles.open, { backgroundColor: colors.button }]}>
        <Text variant="caption" colorValue={colors.onButton} style={styles.openText}>
          {m.cards.open}
        </Text>
        <Ionicons name="arrow-forward" size={14} color={colors.onButton} />
      </View>
    </Pressable>
  );
}

/** A hint of the seals' navy in the glass, under a faint white sheen. */
const GLASS_TINT = "rgba(38, 50, 74, 0.3)";
const GLASS = "rgba(255, 255, 255, 0.1)";

/**
 * Android's BlurView does not blur the map (its GL surface cannot be captured), so it would only be a
 * thin tint with the labels showing through. There the glass is a solid navy instead.
 */
const ANDROID_GLASS = "#161E32";

/** Clear frosted glass: the night map shows through, blurred; the dark tint keeps white text readable over the fog. Its parent clips it to its corners. */
export function GlassFill() {
  if (Platform.OS === "android") {
    return (
      <>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ANDROID_GLASS }]} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS }]} />
      </>
    );
  }
  return (
    <>
      <BlurView intensity={50} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS_TINT }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: GLASS }]} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  listWrap: {
    flex: 1,
  },
  listHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingBottom: spacing.sm,
  },
  listTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  hide: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  listTitle: {
    fontFamily: fontFamily.display,
    fontSize: 20,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: spacing.lg,
  },
  listRow: {
    height: LIST_ROW,
    justifyContent: "center",
  },
  listChoose: {
    height: LIST_ROW,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xs,
    // Room for "İncele", which sits over the row's right end.
    paddingRight: 104,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  listPhoto: {
    width: 62,
    height: 62,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  listOpen: {
    position: "absolute",
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    height: 32,
    paddingLeft: spacing.md - 2,
    paddingRight: spacing.sm,
    borderRadius: 16,
  },
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    height: 34,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm + spacing.xxs,
    borderRadius: 17,
  },
  openText: {
    fontFamily: fontFamily.sansSemiBold,
  },
});
  /** What a card does, in a word: the whole card is the target, this only says so. */
