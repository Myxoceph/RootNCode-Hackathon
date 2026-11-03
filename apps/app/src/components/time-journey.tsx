import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetSummary, Media } from "@vagabonds/contracts";
import { fontFamily, palette, spacing, Text } from "@vagabonds/ui";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AssetImage } from "@/components/asset-image";
import { stripIndexAt, type Century } from "@/lib/home";
import { useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const NATIVE_DRIVER = Platform.OS !== "web";
const WHITE = "#ffffff";

const CARD_SHARE = 0.8;
const CARD_TALLEST = 1.5;
const CARD_SHORTEST = 280;
const CARD_GAP = spacing.md;
const CARD_RADIUS = 28;
const DECK_COUNT = 8;
/** The scroller clips what leaves it, so it reaches this far past the cards for their shadows to fall whole. */
const SHADOW_ROOM = 56;

const STRIP_HEIGHT = 60;
const STRIP_GAP = 2;
const STRIP_FRONT = 78;

interface TimeJourneyProps {
  centuries: Century[];
  opening: Century | null;
  page: number;
  /** Room below the strip, for the phone's home indicator. */
  bottomInset: number;
  /** The words above the journey, on the same backdrop. */
  children: ReactNode;
}

/**
 * Zamanda Yolculuk: a deck of a century's assets over a strip of the centuries they
 * were built in, each shown by its best-known asset's photo. The backdrop takes its colours
 * from the asset in front. Always dark, in both themes. A screen reader or the arrow keys move the
 * strip one century at a time.
 */
export function TimeJourney({ centuries, opening, page, bottomInset, children }: TimeJourneyProps) {
  const insets = useSafeAreaInsets();
  const sealed = useUnlockedAssets();
  const [picked, setPicked] = useState<number | null>(null);
  const [front, setFront] = useState<AssetSummary | null>(null);
  const index = picked ?? (opening ? centuries.indexOf(opening) : 0);
  const century = centuries[index] ?? opening;
  const cover = (front ?? century?.assets[0])?.cover ?? null;

  const pick = useCallback((next: number) => {
    setPicked(next);
    setFront(null);
  }, []);

  return (
    <View style={[styles.band, { paddingBottom: bottomInset }]}>
      <Backdrop cover={cover} />
      <View style={[styles.column, { width: page }]}>
        <View style={[styles.words, { paddingTop: insets.top + spacing.lg }]}>{children}</View>
        {century && (
          <>
            <Deck key={century.number} assets={century.assets} sealed={sealed} page={page} onFront={setFront} />
            {centuries.length > 1 && <CenturyStrip centuries={centuries} index={index} onChange={pick} />}
          </>
        )}
      </View>
    </View>
  );
}

/** The front asset's colours, from its tiny preview so they change at once; dimmed for the white words. */
function Backdrop({ cover }: { cover: Media | null }) {
  const reducedMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      pointerEvents="none"
      onLayout={(event: LayoutChangeEvent) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFill, { backgroundColor: cover?.dominantColor ?? palette.gece800 }]}
    >
      {cover?.lqip && <Image source={{ uri: cover.lqip }} contentFit="cover" blurRadius={40} transition={reducedMotion ? 0 : 450} style={StyleSheet.absoluteFill} accessible={false} />}
      {/* Sized in numbers: on iOS a percent height here stops short, the band's own height being unset. */}
      {size.height > 0 && (
        <Svg key={`${size.width}x${size.height}`} width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="journey-dark" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.3} />
              <Stop offset="0.55" stopColor="#000000" stopOpacity={0.42} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.82} />
            </LinearGradient>
          </Defs>
          <Rect width={size.width} height={size.height} fill="url(#journey-dark)" />
        </Svg>
      )}
    </View>
  );
}

interface DeckProps {
  assets: AssetSummary[];
  sealed: ReadonlySet<string>;
  page: number;
  onFront: (asset: AssetSummary) => void;
}

/** The century's assets; the one in the middle stands forward. */
function Deck({ assets, sealed, page, onFront }: DeckProps) {
  const reducedMotion = useReducedMotion();
  const scrollX = useRef(new Animated.Value(0)).current;
  const shown = useMemo(() => assets.slice(0, DECK_COUNT), [assets]);
  const width = Math.round(page * CARD_SHARE);
  // The deck takes the height the screen leaves, within what still suits a photo.
  const [room, setRoom] = useState(0);
  const height = Math.round(Math.max(CARD_SHORTEST, Math.min(room, width * CARD_TALLEST)));
  const step = width + CARD_GAP;
  const frontAt = useRef(0);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: NATIVE_DRIVER,
        listener: (event: { nativeEvent: { contentOffset: { x: number } } }) => {
          const at = Math.round(event.nativeEvent.contentOffset.x / step);
          const asset = shown[at];
          if (asset && at !== frontAt.current) {
            frontAt.current = at;
            onFront(asset);
          }
        },
      }),
    [scrollX, step, shown, onFront],
  );

  return (
    <View style={styles.deck} onLayout={(event: LayoutChangeEvent) => setRoom(event.nativeEvent.layout.height)}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={styles.deckScroller}
        contentContainerStyle={{ gap: CARD_GAP, paddingHorizontal: (page - width) / 2, paddingVertical: SHADOW_ROOM }}
      >
        {shown.map((asset, at) => {
          const around = [(at - 1) * step, at * step, (at + 1) * step];
          const motion = reducedMotion
            ? null
            : {
                opacity: scrollX.interpolate({ inputRange: around, outputRange: [0.6, 1, 0.6], extrapolate: "clamp" }),
                transform: [{ scale: scrollX.interpolate({ inputRange: around, outputRange: [0.92, 1, 0.92], extrapolate: "clamp" }) }],
              };
          return (
            <Animated.View key={asset.id} style={[styles.cardShadow, { width, height }, motion]}>
              <Card asset={asset} sealed={sealed.has(asset.id)} width={width} height={height} />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

function Card({ asset, sealed, width, height }: { asset: AssetSummary; sealed: boolean; width: number; height: number }) {
  const place = `${asset.district}, ${asset.city.label}`;
  const chips = [asset.yearLabel, asset.era?.label].filter(Boolean).join(" · ");
  return (
    <Link href={{ pathname: "/asset/[id]", params: { id: asset.id } }} asChild>
      {/* One flat style object: `Link asChild` takes neither a style function nor an array. */}
      <Pressable accessibilityRole="link" accessibilityLabel={`${asset.name}, ${chips}, ${place}${sealed ? ", mühürlü" : ""}, eser kartını açar`} style={styles.card}>
        {asset.cover && <AssetImage media={asset.cover} decorative fill />}
        {/* Sized in numbers and redrawn on a new size: on iOS a percent height stays at the first one. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg key={height} width={width} height={height}>
            <Defs>
              <LinearGradient id={`journey-card-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.5" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0.88} />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={height} fill={`url(#journey-card-${asset.id})`} />
          </Svg>
        </View>
        {sealed && (
          <View style={styles.seal}>
            <Ionicons name="checkmark" size={18} color={palette.gece900} />
          </View>
        )}
        <View style={styles.cardWords}>
          <Text variant="heading" colorValue={WHITE} numberOfLines={2} style={styles.cardName}>
            {asset.name}
          </Text>
          <Text variant="caption" colorValue={WHITE} numberOfLines={1}>
            {place}
          </Text>
          {chips.length > 0 && (
            <Text variant="caption" colorValue={WHITE} numberOfLines={1} style={styles.cardChips}>
              {chips}
            </Text>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

interface CenturyStripProps {
  centuries: Century[];
  index: number;
  onChange: (index: number) => void;
}

/**
 * The centuries as a strip of photos, as in a phone's photo gallery, oldest first: sliding a finger along
 * it opens the century under the finger, whose photo widens.
 */
function CenturyStrip({ centuries, index, onChange }: CenturyStripProps) {
  const [width, setWidth] = useState(0);
  const latest = useRef({ width, count: centuries.length, onChange });
  latest.current = { width, count: centuries.length, onChange };

  const follow = (x: number) => {
    const { width: w, count, onChange: change } = latest.current;
    if (w > 0) change(stripIndexAt(x, w, count));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => follow(event.nativeEvent.locationX),
      onPanResponderMove: (event) => follow(event.nativeEvent.locationX),
      // Only a plainly upward or downward start leaves the page to scroll.
      onPanResponderTerminationRequest: (_, gesture) => Math.abs(gesture.dy) > Math.abs(gesture.dx) * 2,
    }),
  ).current;

  const century = centuries[index];
  const step = (by: number) => onChange(Math.min(centuries.length - 1, Math.max(0, index + by)));
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") step(1);
    if (event.nativeEvent.actionName === "decrement") step(-1);
  };
  const valueText = century ? `${century.decades}, ${century.assets.length} eser` : "";
  // react-native-web forwards keyboard events on focusable views; native has no keyboard here.
  const webProps =
    Platform.OS === "web"
      ? ({
          tabIndex: 0,
          "aria-valuemin": 0,
          "aria-valuemax": centuries.length - 1,
          "aria-valuenow": index,
          "aria-valuetext": valueText,
          onKeyDown: (event: { key: string; preventDefault: () => void }) => {
            if (event.key === "ArrowRight" || event.key === "ArrowUp") step(1);
            else if (event.key === "ArrowLeft" || event.key === "ArrowDown") step(-1);
            else return;
            event.preventDefault();
          },
        } as object)
      : {};

  const narrow = centuries.length > 1 ? Math.max(0, (width - STRIP_FRONT - STRIP_GAP * (centuries.length - 1)) / (centuries.length - 1)) : 0;

  return (
    <View style={styles.strip}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.stripHead}>
        <Text variant="heading" colorValue={WHITE} style={styles.stripCentury}>
          {century?.decades}
        </Text>
        <Text colorValue={WHITE}>{century ? `${century.assets.length} eser` : ""}</Text>
      </View>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Yüzyıl seç"
        accessibilityValue={{ min: 0, max: centuries.length - 1, now: index, text: valueText }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={onAction}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        style={styles.stripRow}
        {...webProps}
        {...pan.panHandlers}
      >
        {width > 0 && centuries.map((item, at) => <StripPhoto key={item.number} cover={item.assets[0]?.cover ?? null} chosen={at === index} width={at === index ? STRIP_FRONT : narrow} />)}
      </View>
    </View>
  );
}

/** Glides to its width, so the chosen one seems to open out of the strip. */
function StripPhoto({ cover, chosen, width }: { cover: Media | null; chosen: boolean; width: number }) {
  const reducedMotion = useReducedMotion();
  const size = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    if (reducedMotion) size.setValue(width);
    else Animated.spring(size, { toValue: width, tension: 140, friction: 16, useNativeDriver: false }).start();
  }, [width, reducedMotion, size]);

  return (
    <Animated.View pointerEvents="none" style={[styles.stripPhoto, chosen && styles.stripPhotoChosen, { width: size }]}>
      {cover && <AssetImage media={cover} decorative fill />}
      {!chosen && <View style={styles.stripDim} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: {
    flex: 1,
    alignItems: "center",
    backgroundColor: palette.gece800,
  },
  column: {
    flex: 1,
    gap: spacing.sm,
  },
  words: {
    paddingHorizontal: spacing.lg,
  },
  deck: {
    flex: 1,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  deckScroller: {
    flexGrow: 0,
    marginVertical: -SHADOW_ROOM,
  },
  cardShadow: {
    borderRadius: CARD_RADIUS,
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  card: {
    flex: 1,
    overflow: "hidden",
    borderRadius: CARD_RADIUS,
    backgroundColor: palette.gece800,
  },
  seal: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
  },
  cardWords: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.xxs,
  },
  cardName: {
    fontFamily: fontFamily.sansBold,
    letterSpacing: -0.3,
  },
  cardChips: {
    fontFamily: fontFamily.sansSemiBold,
    opacity: 0.8,
  },
  strip: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  stripHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  stripCentury: {
    fontFamily: fontFamily.sansBold,
    letterSpacing: -0.3,
  },
  stripRow: {
    height: STRIP_HEIGHT,
    flexDirection: "row",
    gap: STRIP_GAP,
  },
  stripPhoto: {
    height: STRIP_HEIGHT,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: palette.gece800,
  },
  stripPhotoChosen: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: WHITE,
  },
  stripDim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
});
