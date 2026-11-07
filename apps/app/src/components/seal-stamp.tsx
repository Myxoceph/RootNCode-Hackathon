import { cameraColors, fontFamily, palette, spacing, Text } from "@vagabonds/ui";
import * as Haptics from "expo-haptics";
import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { beads, bleedBlots, scallopPath, starPath, wornSpots } from "@/lib/seal-impression";

/** The seal's square, and its centre. */
const SIZE = 220;
const MID = SIZE / 2;
/** The impression's bumpy edge, and the rings inside it. */
const EDGE = 98;
const RING = 86;
const INNER_RING = 80;
/** The ink soaks into the page between the bumps, this far out from the middle. */
const SOAK = EDGE + 4;
/** Seal ink: a deep red, as a foundation's seal is pressed. Light text on it reads at 5:1. */
const INK = palette.mercan700;
const ON_INK = cameraColors.text;
/** Wet ink is darker; this much of the dark lies over it at the strike and dries away. */
const WET = 0.38;

/** Where the stamp's one animated value stands as it hangs over the page, and as it strikes. */
const STAMP_HANGS = 0.6;
const STAMP_STRIKES = 0.8;
const FALL_MS = 760;
const HANG_MS = 170;
const DROP_MS = 120;
/** How long after it starts falling the stamp strikes the page. */
const STRIKE_MS = FALL_MS + HANG_MS + DROP_MS;
/** The ink runs out from the middle to the edge in this long, and dries in this long. */
const SPREAD_MS = 680;
const DRY_MS = 1400;
/** The second, lighter tap: the ink settling under the stamp. */
const SETTLE_TAP_MS = 110;
/** The ink starts as a drop this big, not as nothing: a scale of 0 cannot be undone by the counter-scale. */
const DROP = 0.06;
/** How far above and below the middle the stars stand; how wide the words may run. */
const STARS = 66;
const WORDS = 140;

/**
 * The seal comes down like a stamp. A brass stamp sinks in large, hangs for a beat and strikes; the page
 * jolts and a ring spreads. The stamp lifts away and leaves its impression in red ink, which runs out
 * from where it pressed to the bumpy edge, soaks a little past it, and dries lighter. Felt as two short taps.
 *
 * With reduced motion the impression is simply there, dry; the taps stay, as they move nothing on screen.
 * `reveal` is run with the strike, for what the screen shows under the seal.
 */
export const SealStamp = memo(function SealStamp({
  name,
  caption,
  date,
  reduceMotion,
  reveal,
}: {
  name: string;
  caption: string;
  date: string;
  reduceMotion: boolean;
  reveal: Animated.Value;
}) {
  const start = reduceMotion ? 1 : 0;
  const stamp = useRef(new Animated.Value(start)).current;
  const strike = useRef(new Animated.Value(start)).current;
  const lift = useRef(new Animated.Value(start)).current;
  const spread = useRef(new Animated.Value(reduceMotion ? 1 : DROP)).current;
  const dry = useRef(new Animated.Value(start)).current;

  // The stamp is felt as it strikes, and once more as the ink settles under it.
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
      for (const value of [stamp, strike, lift, spread, dry, reveal]) value.setValue(1);
      return;
    }
    const ease = Easing.out(Easing.cubic);
    const animation = Animated.sequence([
      Animated.timing(stamp, { toValue: STAMP_HANGS, duration: FALL_MS, easing: ease, useNativeDriver: true }),
      Animated.delay(HANG_MS),
      Animated.timing(stamp, { toValue: STAMP_STRIKES, duration: DROP_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(stamp, { toValue: 1, damping: 10, stiffness: 180, mass: 0.7, useNativeDriver: true }),
        Animated.timing(strike, { toValue: 1, duration: 720, easing: ease, useNativeDriver: true }),
        Animated.timing(spread, { toValue: 1, duration: SPREAD_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 1, duration: 460, delay: 160, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(dry, { toValue: 1, duration: DRY_MS, delay: SPREAD_MS / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(reveal, { toValue: 1, duration: 520, delay: 300, easing: ease, useNativeDriver: true }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, stamp, strike, lift, spread, dry, reveal]);

  const clamp = { extrapolate: "clamp" } as const;
  // The brass stamp: falls in large and turning, strikes, then lifts off the page.
  const fall = stamp.interpolate({ inputRange: [0, STAMP_HANGS, STAMP_STRIKES, 1], outputRange: [2.4, 1.26, 0.92, 1] });
  const rise = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const rotate = stamp.interpolate({ inputRange: [0, STAMP_HANGS, 1], outputRange: ["-22deg", "-8deg", "-8deg"], ...clamp });
  const headOpacity = Animated.multiply(
    stamp.interpolate({ inputRange: [0, STAMP_HANGS * 0.6, 1], outputRange: [0, 1, 1], ...clamp }),
    lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  );
  // The ink is there from the strike on, only as a drop until it runs out.
  const inked = stamp.interpolate({ inputRange: [0, STAMP_STRIKES - 0.02, STAMP_STRIKES, 1], outputRange: [0, 0, 1, 1], ...clamp });
  const one = useRef(new Animated.Value(1)).current;
  const unspread = Animated.divide(one, spread);
  const soaked = spread.interpolate({ inputRange: [DROP, 0.85, 1], outputRange: [0, 0, 1], ...clamp });
  const jolt = strike.interpolate({ inputRange: [0, 0.06, 0.14, 0.24, 0.36, 1], outputRange: [0, 5, -3, 2, -1, 0] });

  return (
    <Animated.View style={[styles.stage, { transform: [{ translateY: jolt }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.ring,
          {
            opacity: strike.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 0.9, 0] }),
            transform: [{ scale: strike.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.6] }) }],
          },
        ]}
      />

      {/* Turned as the stamp was as it struck, so the impression lies at its angle. */}
      <Animated.View style={[styles.fill, { opacity: inked, transform: [{ rotate: "-8deg" }] }]}>
        <Animated.View style={[styles.fill, { opacity: soaked, transform: [{ scale: soaked.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
          <Bleed seed={name} />
        </Animated.View>
        {/* The ink runs out as a growing circle; what is inside is scaled back, so it stays put and only shows more of itself. */}
        <Animated.View style={[styles.clip, { transform: [{ scale: spread }] }]}>
          <Animated.View style={[styles.fill, { transform: [{ scale: unspread }] }]}>
            <Impression seed={name} />
            <Animated.View style={[styles.wet, { opacity: dry.interpolate({ inputRange: [0, 1], outputRange: [WET, 0] }) }]} />
            <View style={styles.words}>
              <Text style={styles.caption} colorValue={ON_INK}>
                {caption}
              </Text>
              <Text variant="heading" colorValue={ON_INK} style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {name}
              </Text>
              <Text style={styles.caption} colorValue={ON_INK}>
                {date}
              </Text>
            </View>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.head, { opacity: headOpacity, transform: [{ scale: Animated.multiply(fall, rise) }, { rotate }] }]}>
        <View style={styles.headInner}>
          <Svg width={44} height={44} viewBox="0 0 44 44">
            <Path d={starPath(22, 22, 20, 9)} fill={cameraColors.gold} />
          </Svg>
        </View>
      </Animated.View>
    </Animated.View>
  );
});

/** The seal as pressed: red ink to the bumpy edge, two light rings with beads between, a star above and below, a few worn spots. */
const Impression = memo(function Impression({ seed }: { seed: string }) {
  const drawing = useMemo(
    () => ({
      beads: beads(MID, MID, (EDGE + RING) / 2 - 1, 36, 1.6),
      worn: wornSpots(seed, MID, MID, 20, EDGE - 4, 26),
    }),
    [seed],
  );
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={StyleSheet.absoluteFill}>
      <Path d={scallopPath(MID, MID, EDGE, 40)} fill={INK} />
      <Circle cx={MID} cy={MID} r={RING} fill="none" stroke={ON_INK} strokeOpacity={0.85} strokeWidth={1.6} />
      <Circle cx={MID} cy={MID} r={INNER_RING} fill="none" stroke={ON_INK} strokeOpacity={0.6} strokeWidth={0.8} strokeDasharray="2 3" />
      {drawing.beads.map((bead, at) => (
        <Circle key={at} cx={bead.x} cy={bead.y} r={bead.r} fill={ON_INK} fillOpacity={0.8} />
      ))}
      <Path d={starPath(MID, MID - STARS, 6, 2.6)} fill={ON_INK} fillOpacity={0.85} />
      <Path d={starPath(MID, MID + STARS, 6, 2.6)} fill={ON_INK} fillOpacity={0.85} />
      {drawing.worn.map((spot, at) => (
        <Circle key={`w${at}`} cx={spot.x} cy={spot.y} r={spot.r} fill={cameraColors.background} fillOpacity={0.28} />
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
  ring: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: MID,
    borderWidth: 3,
    borderColor: cameraColors.gold,
  },
  clip: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: MID,
    overflow: "hidden",
  },
  wet: {
    position: "absolute",
    left: MID - EDGE,
    top: MID - EDGE,
    width: EDGE * 2,
    height: EDGE * 2,
    borderRadius: EDGE,
    backgroundColor: "#000000",
  },
  words: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: MID - WORDS / 2,
  },
  name: {
    textAlign: "center",
  },
  caption: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 2,
  },
  head: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: MID,
    borderWidth: 3,
    borderColor: cameraColors.gold,
    padding: 8,
  },
  headInner: {
    flex: 1,
    borderRadius: MID,
    borderWidth: 1,
    borderColor: cameraColors.gold,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
