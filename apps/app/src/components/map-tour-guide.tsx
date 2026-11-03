import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { announce } from "@/lib/announce";
import { COUNTED_STEPS, isTabStep, MAP_TOUR_STEPS, TAB_OF, TAB_STEPS, type MapTourStep, type TabStep } from "@/lib/map-tour";
import { setTabSpotlight, useTabSpots, type TabSpot } from "@/lib/tab-bar-spots";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { MapSpots } from "@/map";

/** Gold on night blue in both themes, as the map's seals. */
const BUBBLE = palette.altin300;
const ON_BUBBLE = palette.gece950;
const BUBBLE_WIDTH = 248;
const ARROW = 9;
/** Room between the arrow's tip and what it points at. */
const GAP = 14;
const EDGE = spacing.lg;
const RING = 56;
/** The example scan's phone is centred; the bubble stands over its top edge. */
const PHONE_HALF_HEIGHT = 188;

/** "BURSA" (the map's label) as "Bursa". */
function titleCase(name: string): string {
  const lower = name.toLocaleLowerCase("tr-TR");
  return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
}

/** The steps whose bubble stands beside something on the map. */
const POINTING = new Set<MapTourStep>(["city", "choose", "unlock", ...TAB_STEPS]);


interface Target {
  x: number;
  y: number;
  /** A box to ring instead of a point ("Kilidini aç"). */
  box?: { x: number; y: number; width: number; height: number };
}

function targetOf(step: MapTourStep, spots: MapSpots | null, tabs: Readonly<Record<string, TabSpot>>, width: number, height: number): Target | null {
  if (isTabStep(step)) {
    const box = tabs[TAB_OF[step]];
    return box ? { x: box.x + box.width / 2, y: box.y, box } : null;
  }
  if (step === "city" && spots?.province) return spots.province;
  if (step === "choose" && spots?.asset) return spots.asset;
  if (step === "unlock" && spots?.unlock) {
    const box = spots.unlock;
    return { x: box.x + box.width / 2, y: box.y, box };
  }
  if (step === "scan") return { x: width / 2, y: height / 2 - PHONE_HALF_HEIGHT };
  return null;
}

/**
 * The map tour's guide: a thin step bar with "Geç" at the top, and a gold bubble beside what to tap
 * next, its arrow on it and a ring pulsing there. Steps with nothing to tap (the opened asset, the
 * last word) keep the bubble at the top; while the unlocking scene plays, only the bar stays. Then the
 * bubble stands over each tab of the bar in turn, with "İleri" in it, gliding from tab to tab. Each step is said aloud.
 */
export function MapTourGuide({
  step,
  spots,
  top,
  onNext,
  onPrevious,
  onSkip,
}: {
  step: MapTourStep;
  spots: MapSpots | null;
  top: number;
  onNext: () => void;
  /** "Önceki" beside "Geç"; null on the first step, where it stays on screen dimmed. */
  onPrevious: (() => void) | null;
  onSkip: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const [bubbleHeight, setBubbleHeight] = useState(72);
  const { title, body } = MAP_TOUR_STEPS[step];
  const index = COUNTED_STEPS.indexOf(step);

  const barTop = top + spacing.sm;
  const barBottom = barTop + 36;
  const tabs = useTabSpots();
  const target = targetOf(step, spots, tabs, width, height);
  const onTab = isTabStep(step);
  const lastTab = step === TAB_STEPS[TAB_STEPS.length - 1];
  // A step that points at something waits for it (the camera still flying, the button not up yet), instead of
  // showing at the top first and jumping over to it. While the unlocking scene plays, the scene says it.
  const shown = (target !== null || !POINTING.has(step)) && !(step === "opened" && !reduced);

  // The bar lights the tab being shown and dims the rest.
  useEffect(() => setTabSpotlight(onTab ? TAB_OF[step as TabStep] : null), [onTab, step]);
  useEffect(() => () => setTabSpotlight(null), []);

  useEffect(() => announce(`${title}. ${body}`), [title, body]);
  // From tab to tab the bubble stays up and glides over; anywhere else a new step pops in.
  const placed = `${onTab ? "tabs" : step}:${shown}`;
  useEffect(() => {
    enter.setValue(0);
    if (shown) Animated.timing(enter, { toValue: 1, duration: reduced ? 0 : 280, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [placed, shown, enter, reduced]);

  // Over the target when there is room, under it otherwise; at the top with no target.
  const above = target ? target.y - GAP - ARROW - bubbleHeight > barBottom + spacing.sm : false;
  const bubbleTop = !target ? barBottom + spacing.md : above ? target.y - GAP - ARROW - bubbleHeight : target.y + (target.box ? target.box.height : 0) + GAP + ARROW;
  const bubbleLeft = Math.min(Math.max((target?.x ?? width / 2) - BUBBLE_WIDTH / 2, EDGE), width - EDGE - BUBBLE_WIDTH);
  const arrowLeft = target ? Math.min(Math.max(target.x - bubbleLeft - ARROW, radius.xl), BUBBLE_WIDTH - radius.xl - ARROW * 2) : null;
  // A new step (or a bubble just come in) is put in place; after that it glides after its target as the map moves.
  const bubbleAt = useGlide(bubbleLeft, bubbleTop, placed, reduced);
  const pulseAt = useGlide(target?.box?.x ?? target?.x ?? 0, target?.box?.y ?? target?.y ?? 0, placed, reduced);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {target && shown && step !== "scan" && (
        <Animated.View pointerEvents="none" style={[styles.anchor, { transform: pulseAt.getTranslateTransform() }]}>
          <Pulse box={target.box ?? null} still={reduced} />
        </Animated.View>
      )}

      <Animated.View
        pointerEvents={onTab && shown ? "box-none" : "none"}
        onLayout={(event) => setBubbleHeight(Math.round(event.nativeEvent.layout.height))}
        style={[
          styles.bubble,
          { opacity: enter, transform: [...bubbleAt.getTranslateTransform(), { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] },
        ]}
      >
        <Text colorValue={ON_BUBBLE} style={styles.title}>
          {title}
        </Text>
        <Text variant="caption" colorValue={palette.gece800}>
          {step === "city" && spots?.province ? `Renkli illerde eser var. ${titleCase(spots.province.name)} gibi birine dokun.` : body}
        </Text>
        {onTab && (
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={lastTab ? "Bitir" : "İleri"}
            hitSlop={8}
            style={({ pressed }) => [styles.next, pressed && styles.replayPressed]}
          >
            <Text variant="caption" colorValue={BUBBLE} style={styles.nextLabel}>
              {lastTab ? "Bitir" : "İleri"}
            </Text>
            {!lastTab && <Ionicons name="arrow-forward" size={14} color={BUBBLE} />}
          </Pressable>
        )}
        {arrowLeft !== null && <View style={[styles.arrow, above ? { bottom: -ARROW } : { top: -ARROW }, { left: arrowLeft }]} />}
      </Animated.View>

      {step !== "done" && (
        <View style={[styles.bar, { top: barTop }]} pointerEvents="box-none">
          <View style={styles.segments} accessibilityLabel={`Adım ${index + 1} / ${COUNTED_STEPS.length}`}>
            {COUNTED_STEPS.map((key, i) => (
              <View key={key} style={[styles.segment, { backgroundColor: i <= index ? BUBBLE : "rgba(255, 255, 255, 0.28)" }]} />
            ))}
          </View>
          <Pressable
            onPress={onPrevious ?? undefined}
            disabled={!onPrevious}
            accessibilityRole="button"
            accessibilityLabel="Önceki adım"
            accessibilityState={{ disabled: !onPrevious }}
            hitSlop={8}
            style={({ hovered }) => [styles.skip, styles.back, hovered && onPrevious && styles.skipHovered, !onPrevious && styles.backOff]}
          >
            <Ionicons name="chevron-back" size={14} color={palette.white} />
            <Text variant="caption" colorValue={palette.white} style={styles.skipLabel}>
              Önceki
            </Text>
          </Pressable>
          <Pressable onPress={onSkip} accessibilityRole="button" accessibilityLabel="Gösterimi geç" hitSlop={8} style={({ hovered }) => [styles.skip, hovered && styles.skipHovered]}>
            <Text variant="caption" colorValue={palette.white} style={styles.skipLabel}>
              Geç
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * A point that follows `x`, `y`: it jumps there when `placed` changes, and glides there otherwise, so a
 * bubble trails the map smoothly between the map's reports instead of stepping.
 */
function useGlide(x: number, y: number, placed: string, still: boolean): Animated.ValueXY {
  const point = useRef(new Animated.ValueXY({ x, y })).current;
  const last = useRef(placed);
  useEffect(() => {
    if (last.current !== placed || still) {
      last.current = placed;
      point.stopAnimation();
      point.setValue({ x, y });
      return;
    }
    Animated.timing(point, { toValue: { x, y }, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [x, y, placed, still, point]);
  return point;
}

/** In the map's search field, in the tour's gold: plays the tour again from the start. */
export function MapTourReplayButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nasıl oynanır, turu tekrar izle"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.replay, pressed && styles.replayPressed]}
    >
      <View style={styles.replayDisc}>
        <Ionicons name="help" size={20} color={ON_BUBBLE} />
      </View>
    </Pressable>
  );
}

/** A ring that grows and fades over and over where the visitor should tap; around a box, its outline breathes instead. Drawn from its anchor: the point, or the box's top left. */
function Pulse({ box, still }: { box: Target["box"] | null; still: boolean }) {
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(beat, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [beat, still]);

  const opacity = beat.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  if (box) {
    const { width, height } = box;
    return (
      <Animated.View
        pointerEvents="none"
        style={[styles.boxRing, { left: -5, top: -5, width: width + 10, height: height + 10, opacity: still ? 0.9 : beat.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.95, 0.35, 0.95] }) }]}
      />
    );
  }
  const scale = beat.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.5] });
  return (
    <View pointerEvents="none" style={[styles.ringSpot, { left: -RING / 2, top: -RING / 2 }]}>
      <Animated.View style={[styles.ring, { opacity: still ? 0.9 : opacity, transform: [{ scale: still ? 1 : scale }] }]} />
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  // The touch target stays full size; the disc in it is a little smaller, as the field's other icons.
  replay: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
  },
  replayPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  next: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: ON_BUBBLE,
  },
  nextLabel: {
    fontFamily: fontFamily.sansSemiBold,
  },
  replayDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BUBBLE,
  },
  bar: {
    position: "absolute",
    left: EDGE,
    right: EDGE,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  segments: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  skip: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: "rgba(6, 8, 13, 0.55)",
  },
  backOff: {
    opacity: 0.4,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: spacing.sm,
  },
  skipHovered: {
    backgroundColor: "rgba(6, 8, 13, 0.75)",
  },
  skipLabel: {
    fontFamily: fontFamily.sansSemiBold,
  },
  anchor: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  bubble: {
    position: "absolute",
    left: 0,
    top: 0,
    width: BUBBLE_WIDTH,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    borderRadius: radius.xl,
    backgroundColor: BUBBLE,
    gap: 2,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
    lineHeight: 21,
  },
  arrow: {
    position: "absolute",
    width: ARROW * 2,
    height: ARROW * 2,
    backgroundColor: BUBBLE,
    borderRadius: 3,
    transform: [{ rotate: "45deg" }],
    marginTop: 0,
    zIndex: -1,
  },
  ringSpot: {
    position: "absolute",
    width: RING,
    height: RING,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: BUBBLE,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BUBBLE,
    borderWidth: 2,
    borderColor: palette.white,
  },
  boxRing: {
    position: "absolute",
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: BUBBLE,
  },
});
