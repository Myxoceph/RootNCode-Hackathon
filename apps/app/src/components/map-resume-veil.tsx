import { fontFamily, spacing, Text } from "@vagabonds/ui";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { useReducedMotion } from "@/lib/use-reduced-motion";

const NIGHT = "#090E12";
const GOLD = "#E7C26A";
const EMERALD = "#1F9D74";
const DRIFT_MS = 5200;
const SWEEP_MS = 1400;
const MAX_NAME = 88;
/** A letter's width for its height in this type, about: enough to fit a long name on one line. */
const LETTER = 0.56;
const SIDE = spacing.xl;
const TRACK_MAX = 180;

/** A large soft light, drifting slowly from one place to another and back. */
function Light({ color, size, from, to, reduced, strength }: { color: string; size: number; from: { x: number; y: number }; to: { x: number; y: number }; reduced: boolean; strength: number }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: DRIFT_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: DRIFT_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduced]);
  const id = `veil-light-${color.slice(1)}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.light,
        {
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [from.x, to.x] }) },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [from.y, to.y] }) },
          ],
        },
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * What a city opened again comes in behind: night, two soft lights drifting across it, and the city's name
 * large in plain type, with a short line running under it while the map gets ready. The same in both
 * themes. All of it moves on the UI thread, so the map's loading does not touch it; with reduced motion it
 * stands still.
 */
export function MapResumeVeil({ city, line, bottom }: { city: string; line: string; bottom: number }) {
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sweep = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) return;
    const working = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    working.start();
    Animated.timing(rise, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    return () => working.stop();
  }, [reduced, rise, sweep]);

  const { width, height } = size;
  const nameSize = Math.min(MAX_NAME, (width - SIDE * 2) / (Math.max(city.length, 1) * LETTER));
  const light = Math.max(width, height) * 1.05;
  // With the words, and short: at the screen's foot it would lie against the tab bar.
  const trackWidth = Math.min(TRACK_MAX, width - SIDE * 2);
  const markWidth = trackWidth * 0.4;

  return (
    <View style={[StyleSheet.absoluteFill, styles.night]} onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
      {width > 0 && (
        <>
          <Light color={GOLD} size={light} strength={0.3} reduced={reduced} from={{ x: width - light * 0.72, y: -light * 0.4 }} to={{ x: width - light * 0.55, y: -light * 0.22 }} />
          <Light color={EMERALD} size={light} strength={0.34} reduced={reduced} from={{ x: -light * 0.5, y: height - light * 0.62 }} to={{ x: -light * 0.32, y: height - light * 0.8 }} />
          <Animated.View
            style={[
              styles.words,
              {
                paddingBottom: bottom + spacing.xxxl,
                opacity: rise,
                transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              },
            ]}
          >
            <Text colorValue="#FFFFFF" numberOfLines={1} style={[styles.name, { fontSize: nameSize, lineHeight: nameSize * 1.08, letterSpacing: -nameSize * 0.035 }]}>
              {city}
            </Text>
            <Text colorValue="rgba(255, 255, 255, 0.72)" style={styles.line}>
              {line}
            </Text>
            <View style={[styles.track, { width: trackWidth }]}>
              {reduced ? (
                <View style={styles.trackStill} />
              ) : (
                <Animated.View
                  style={[
                    styles.mark,
                    { width: markWidth, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-markWidth, trackWidth] }) }] },
                  ]}
                />
              )}
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  night: {
    overflow: "hidden",
    backgroundColor: NIGHT,
  },
  light: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  words: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: SIDE,
  },
  name: {
    fontFamily: fontFamily.sansBold,
  },
  line: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.sansMedium,
    fontSize: 16,
    lineHeight: 23,
  },
  track: {
    height: 3,
    marginTop: spacing.md,
    overflow: "hidden",
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  mark: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: GOLD,
  },
  trackStill: {
    flex: 1,
    opacity: 0.6,
    backgroundColor: GOLD,
  },
});
