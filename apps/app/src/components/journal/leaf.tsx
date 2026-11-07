import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { book, RuledLines, usePageStyle } from "./paper";

/** Far enough that a lifted leaf does not swell over the screen on a phone. */
const PERSPECTIVE = 2400;
/** The leaf at its most lifted: how dark the face turning from the light goes, and the shadow it throws. */
const FACE_SHADE = 0.3;
const CAST_SHADOW = 0.42;
const RESTING_SHADE = 0.14;
/** The back of a sheet, a shade under the open page: it must show against a light screen. */
const BARE_PAPER = "#EFEBE0";
/** The light on the bend of the paper, the share of the leaf it is as wide as, and how bright. */
const SHEEN_WIDTH = 0.55;
const SHEEN = 0.55;

/** Keeps what is off the open page out of the keyboard's reach on the web; phones use the props. */
function useInert(active: boolean) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS === "web" && ref.current) (ref.current as unknown as { inert: boolean }).inert = !active;
  }, [active]);
  return ref;
}

/** One side of a leaf. Only the side lying open can be read or touched. */
export function LeafFace({ active, children }: { active: boolean; children: ReactNode }) {
  const ref = useInert(active);
  return (
    <View
      ref={ref}
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={StyleSheet.absoluteFill}
    >
      {children}
    </View>
  );
}

function Shade({ opacity, width, height, id, from }: { opacity: Animated.AnimatedInterpolation<number>; width: number; height: number; id: string; from: "spine" | "edge" }) {
  return (
    <Animated.View aria-hidden pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={book.hideDark} stopOpacity={from === "spine" ? 1 : 0} />
            <Stop offset="1" stopColor={book.hideDark} stopOpacity={from === "spine" ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** A band of light going across a turning leaf: a flat sheet does not do this, and so it reads as paper bending. */
function Sheen({ position, number, width, height }: { position: Animated.Value; number: number; width: number; height: number }) {
  const band = width * SHEEN_WIDTH;
  const opacity = position.interpolate({ inputRange: [number, number + 0.08, number + 0.4, number + 0.5], outputRange: [0, SHEEN, SHEEN, 0], extrapolate: "clamp" });
  const translateX = position.interpolate({ inputRange: [number, number + 0.5], outputRange: [width - band * 0.4, -band * 0.3], extrapolate: "clamp" });
  return (
    <Animated.View aria-hidden pointerEvents="none" style={[styles.sheen, { width: band, height, opacity, transform: [{ translateX }] }]}>
      <Svg width={band} height={height}>
        <Defs>
          <LinearGradient id={`journal-sheen-${number}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={1} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={band} height={height} fill={`url(#journal-sheen-${number})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The shadow of the leaf before this one, falling on this one: long and faint as that leaf lifts, drawn
 * in to the spine as it goes over.
 */
function CastShadow({ position, number, width, height }: { position: Animated.Value; number: number; width: number; height: number }) {
  const opacity = position.interpolate({ inputRange: [number - 1, number - 0.78, number - 0.5, number - 0.2, number], outputRange: [0, CAST_SHADOW, CAST_SHADOW * 0.9, CAST_SHADOW * 0.3, 0], extrapolate: "clamp" });
  const scaleX = position.interpolate({ inputRange: [number - 1, number - 0.5, number], outputRange: [1, 0.72, 0.12], extrapolate: "clamp" });
  return (
    <Animated.View aria-hidden pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, transformOrigin: "left center", transform: [{ scaleX }] }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`journal-cast-${number}`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={book.hideDark} stopOpacity={1} />
            <Stop offset="0.7" stopColor={book.hideDark} stopOpacity={0.55} />
            <Stop offset="1" stopColor={book.hideDark} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#journal-cast-${number})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * A leaf of the book, hinged at its left edge. `position` is how far through the book it is open: from
 * `number` to `number + 1` this leaf turns, right over the spine as paper does. With a `back` (two pages
 * open) the back lands on the left page; without one (a phone) what shows is the bare back of the sheet,
 * `backColor`, and it stays lying there, running off the screen's left edge as a book's left page does when
 * the book is too wide to see whole. The turn is transform and opacity only, so it runs on the UI thread.
 */
export function Leaf({
  position,
  number,
  width,
  height,
  left = 0,
  stack,
  front,
  back,
  backColor = book.paper,
  frontActive,
  backActive = false,
}: {
  position: Animated.Value;
  number: number;
  width: number;
  height: number;
  left?: number;
  /** Where it lies among the leaves when not turned over: the first leaf is on top. */
  stack: number;
  front: ReactNode;
  back?: ReactNode;
  /** The bare back of the sheet, when it has no `back`: the cover's is green. */
  backColor?: string;
  frontActive: boolean;
  backActive?: boolean;
}) {
  const twoSided = back !== undefined;
  const page = usePageStyle();
  const span = { inputRange: [number, number + 1], extrapolate: "clamp" as const };
  const rotateY = position.interpolate({ ...span, outputRange: ["0deg", "-180deg"] });
  // A sheet lying turned over keeps a little shade, where it curves down into the spine.
  const faceShade = position.interpolate({ inputRange: [number, number + 0.5, number + 1], outputRange: [0, FACE_SHADE, twoSided ? 0 : RESTING_SHADE], extrapolate: "clamp" });
  const frontOpacity = position.interpolate({ inputRange: [number + 0.495, number + 0.505], outputRange: [1, 0], extrapolate: "clamp" });
  const backOpacity = position.interpolate({ inputRange: [number + 0.495, number + 0.505], outputRange: [0, 1], extrapolate: "clamp" });

  // Past the upright a two-sided leaf lies over those turned before it. Stacking cannot run on the UI thread.
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!twoSided) return;
    const id = position.addListener(({ value }) => setOver(value >= number + 0.5));
    return () => position.removeListener(id);
  }, [position, number, twoSided]);

  return (
    <Animated.View
      style={[
        styles.leaf,
        {
          left,
          width,
          height,
          zIndex: over ? stack + 2000 + number : stack,
          transformOrigin: "left center",
          transform: [{ perspective: PERSPECTIVE }, { rotateY }],
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, twoSided && { opacity: frontOpacity }]}>
        <LeafFace active={frontActive}>{front}</LeafFace>
        <CastShadow position={position} number={number} width={width} height={height} />
        <Shade opacity={faceShade} width={width} height={height} id={`journal-face-${number}`} from="edge" />
        <Sheen position={position} number={number} width={width} height={height} />
      </Animated.View>
      {!twoSided && (
        // Bare, so nothing on it needs turning round to read: its left is still the spine.
        <Animated.View aria-hidden pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bare, { opacity: backOpacity, backgroundColor: backColor === book.paper ? BARE_PAPER : backColor }]}>
          {backColor === book.paper && <RuledLines height={height} line={page.line} plain={page.plain} />}
          <Shade opacity={faceShade} width={width} height={height} id={`journal-bare-${number}`} from="spine" />
        </Animated.View>
      )}
      {twoSided && (
        // Turned round itself, so it reads the right way when the leaf has gone over.
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backOpacity, transform: [{ rotateY: "180deg" }] }]}>
          <LeafFace active={backActive}>{back}</LeafFace>
          <Shade opacity={faceShade} width={width} height={height} id={`journal-back-${number}`} from="spine" />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bare: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(42, 35, 32, 0.16)",
  },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  leaf: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: book.paper,
  },
});
