import { cameraColors, fontFamily, palette, spacing, Text } from "@vagabonds/ui";
import * as Haptics from "expo-haptics";
import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop, Text as SvgText, TextPath } from "react-native-svg";

import { beads, bleedBlots, scallopPath, starPath, wornSpots } from "@/lib/seal-impression";

/** The seal's square, and its centre. */
const SIZE = 220;
const MID = SIZE / 2;
/** The seal's bumpy edge, the rings inside it, and the circle its words run round. */
const EDGE = 98;
const RING = 86;
const INNER_RING = 60;
const WORDS_RING = 72;
const WORDS_SIZE = 10;
/** The ink soaks into the page between the bumps, this far out from the middle. */
const SOAK = EDGE + 4;
/** Seal ink: a deep red, as a foundation's seal is pressed. Light text on it reads at 5:1. */
const INK = palette.mercan700;
const ON_INK = cameraColors.text;
/** Wet ink is darker; this much of the dark lies over it at the strike and dries away. */
const WET = 0.4;
/** The middle's words keep inside the inner ring. */
const MIDDLE_WIDTH = 96;

/** The seal shows above the page, draws back a little, and comes down hard. */
const APPEAR_MS = 260;
const DRAW_BACK_MS = 300;
const SLAM_MS = 130;
/** How long after it starts the seal strikes the page. */
const STRIKE_MS = APPEAR_MS + DRAW_BACK_MS + SLAM_MS;
/** Above the page: larger, turned further and higher. */
const HOVER = { scale: 1.45, turn: -15, lift: -16 };
const DRAWN_BACK = { scale: 1.56, turn: -17, lift: -26 };
const PRESSED_TURN = -8;
/** The ink soaks past the edge in this long, and dries in this long. */
const SOAK_MS = 520;
const DRY_MS = 1400;
/** The second, lighter tap: the ink settling under the seal. */
const SETTLE_TAP_MS = 110;

const EDGE_PATH = scallopPath(MID, MID, EDGE, 40);

/** The circle the words run round, starting on the left and going over the top. */
const WORDS_PATH = `M${MID - WORDS_RING} ${MID}a${WORDS_RING} ${WORDS_RING} 0 1 1 ${WORDS_RING * 2} 0a${WORDS_RING} ${WORDS_RING} 0 1 1 ${-WORDS_RING * 2} 0`;

/**
 * Ziyaret Mührü's seal: one red seal from start to end. It shows above the page with its ink still wet and
 * dark, draws back a little and comes down hard. It stops dead, as a pressed seal does: no bounce. The
 * page jolts, a ring of ink spreads, its shadow is gone under it, and the ink soaks just past the bumpy
 * edge and dries to its colour. Its words run round the ring, the monument's name and the day in the
 * middle. Felt as two short taps.
 *
 * With reduced motion the seal is simply there, dry; the taps stay, as they move nothing on screen.
 * `reveal` is run with the strike, for what the screen shows under the seal.
 */
export const SealStamp = memo(function SealStamp({
  name,
  ring,
  date,
  reduceMotion,
  reveal,
}: {
  name: string;
  /** The words round the ring, e.g. "ZİYARET MÜHRÜ • VAKIF MİRASI". */
  ring: string;
  date: string;
  reduceMotion: boolean;
  reveal: Animated.Value;
}) {
  const start = reduceMotion ? 1 : 0;
  const appear = useRef(new Animated.Value(start)).current;
  const drawBack = useRef(new Animated.Value(start)).current;
  const slam = useRef(new Animated.Value(start)).current;
  const strike = useRef(new Animated.Value(start)).current;
  const soak = useRef(new Animated.Value(start)).current;
  const dry = useRef(new Animated.Value(start)).current;

  // The seal is felt as it strikes, and once more as the ink settles under it.
  useEffect(() => {
    const at = reduceMotion ? 0 : STRIKE_MS;
    const struck = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), at);
    const settled = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), at + SETTLE_TAP_MS);
    return () => {
      clearTimeout(struck);
      clearTimeout(settled);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      for (const value of [appear, drawBack, slam, strike, soak, dry, reveal]) value.setValue(1);
      return;
    }
    const ease = Easing.out(Easing.cubic);
    const animation = Animated.sequence([
      Animated.timing(appear, { toValue: 1, duration: APPEAR_MS, easing: ease, useNativeDriver: true }),
      Animated.timing(drawBack, { toValue: 1, duration: DRAW_BACK_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(slam, { toValue: 1, duration: SLAM_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(strike, { toValue: 1, duration: 700, easing: ease, useNativeDriver: true }),
        Animated.timing(soak, { toValue: 1, duration: SOAK_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(dry, { toValue: 1, duration: DRY_MS, delay: 250, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(reveal, { toValue: 1, duration: 520, delay: 300, easing: ease, useNativeDriver: true }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, appear, drawBack, slam, strike, soak, dry, reveal]);

  // Hovering, drawn back, pressed: each step from the one before.
  const between = (from: number, to: number, value: Animated.Value) => value.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const hover = { scale: between(HOVER.scale, DRAWN_BACK.scale, drawBack), lift: between(HOVER.lift, DRAWN_BACK.lift, drawBack), turn: between(HOVER.turn, DRAWN_BACK.turn, drawBack) };
  const scale = Animated.add(Animated.multiply(hover.scale, Animated.subtract(1, slam)), slam);
  const lift = Animated.multiply(hover.lift, Animated.subtract(1, slam));
  const turn = Animated.add(Animated.multiply(hover.turn, Animated.subtract(1, slam)), Animated.multiply(slam, PRESSED_TURN));
  const rotate = turn.interpolate({ inputRange: [-180, 180], outputRange: ["-180deg", "180deg"] });
  // Its shadow on the page: wide and soft while it is high, tight and dark as it comes down; gone once pressed.
  const shadowScale = Animated.add(between(1.18, 1.26, drawBack), Animated.multiply(slam, -0.24));
  const shadowOpacity = Animated.multiply(
    Animated.multiply(appear, Animated.add(between(0.3, 0.24, drawBack), Animated.multiply(slam, 0.3))),
    strike.interpolate({ inputRange: [0, 0.12], outputRange: [1, 0], extrapolate: "clamp" }),
  );
  const jolt = strike.interpolate({ inputRange: [0, 0.05, 0.12, 0.22, 0.34, 1], outputRange: [0, 6, -3, 2, -1, 0] });

  return (
    <Animated.View style={[styles.stage, { transform: [{ translateY: jolt }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.shadow, { opacity: shadowOpacity, transform: [{ scale: shadowScale }] }]} />
      <Animated.View
        style={[
          styles.ripple,
          {
            opacity: strike.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 0.8, 0] }),
            transform: [{ scale: strike.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.55] }) }],
          },
        ]}
      />

      <Animated.View style={[styles.fill, { opacity: appear, transform: [{ translateY: lift }, { scale }, { rotate }] }]}>
        <Animated.View style={[styles.fill, { opacity: soak, transform: [{ scale: soak.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
          <Bleed seed={name} />
        </Animated.View>
        <Face seed={name} ring={ring} />
        {/* Wet ink: the same bumpy shape, dark, drying away. */}
        <Animated.View style={[styles.fill, { opacity: dry.interpolate({ inputRange: [0, 1], outputRange: [WET, 0] }) }]}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Path d={EDGE_PATH} fill="#000000" />
          </Svg>
        </Animated.View>
        <View style={styles.middle}>
          <Text variant="heading" colorValue={ON_INK} style={styles.name} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
            {name}
          </Text>
          <Text style={styles.date} colorValue={ON_INK}>
            {date}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

/**
 * The seal's face in ink: the bumpy edge, a beaded band, its words round the ring between two fine
 * rings, and a few worn spots where the seal took no ink. A soft light from above gives it some depth.
 */
const Face = memo(function Face({ seed, ring }: { seed: string; ring: string }) {
  const drawing = useMemo(
    () => ({
      beads: beads(MID, MID, (EDGE + RING) / 2 - 1, 36, 1.6),
      worn: wornSpots(seed, MID, MID, 20, EDGE - 4, 26),
    }),
    [seed],
  );
  // The words twice round, with a star at each join; spaced out to fill the circle.
  const words = `${ring}  ✦  ${ring}  ✦  `;
  const spacing = Math.max(0.5, (2 * Math.PI * WORDS_RING) / words.length - WORDS_SIZE * 0.62);
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="seal-light" cx="38%" cy="28%" r="75%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.12} />
        </RadialGradient>
        <Path id="seal-words" d={WORDS_PATH} />
      </Defs>
      <Path d={EDGE_PATH} fill={INK} />
      <Path d={EDGE_PATH} fill="url(#seal-light)" />
      <Circle cx={MID} cy={MID} r={RING} fill="none" stroke={ON_INK} strokeOpacity={0.85} strokeWidth={1.6} />
      {drawing.beads.map((bead, at) => (
        <Circle key={at} cx={bead.x} cy={bead.y} r={bead.r} fill={ON_INK} fillOpacity={0.8} />
      ))}
      <SvgText fill={ON_INK} fillOpacity={0.92} fontSize={WORDS_SIZE} fontFamily={fontFamily.monoMedium} letterSpacing={spacing}>
        <TextPath href="#seal-words" startOffset="0">
          {words}
        </TextPath>
      </SvgText>
      <Circle cx={MID} cy={MID} r={INNER_RING} fill="none" stroke={ON_INK} strokeOpacity={0.7} strokeWidth={1} />
      <Path d={starPath(MID, MID - INNER_RING + 12, 5, 2.2)} fill={ON_INK} fillOpacity={0.85} />
      {drawing.worn.map((spot, at) => (
        <Circle key={`w${at}`} cx={spot.x} cy={spot.y} r={spot.r} fill={cameraColors.background} fillOpacity={0.26} />
      ))}
    </Svg>
  );
});

/** Ink soaked just past the edge. */
const Bleed = memo(function Bleed({ seed }: { seed: string }) {
  const blots = useMemo(() => bleedBlots(seed, MID, MID, SOAK, 22), [seed]);
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={StyleSheet.absoluteFill}>
      {blots.map((blot, at) => (
        <Circle key={at} cx={blot.x} cy={blot.y} r={blot.r} fill={INK} fillOpacity={0.45} />
      ))}
    </Svg>
  );
});

const styles = StyleSheet.create({
  stage: {
    width: SIZE,
    height: SIZE,
    marginBottom: spacing.lg,
  },
  fill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  shadow: {
    position: "absolute",
    left: MID - EDGE,
    top: MID - EDGE + 6,
    width: EDGE * 2,
    height: EDGE * 2,
    borderRadius: EDGE,
    backgroundColor: "#000000",
  },
  ripple: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: MID,
    borderWidth: 3,
    borderColor: INK,
  },
  middle: {
    position: "absolute",
    left: MID - MIDDLE_WIDTH / 2,
    width: MIDDLE_WIDTH,
    top: MID - INNER_RING + 20,
    bottom: MID - INNER_RING + 8,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  name: {
    textAlign: "center",
    fontSize: 18,
    lineHeight: 22,
  },
  date: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 9,
    lineHeight: 13,
    letterSpacing: 1.5,
  },
});
