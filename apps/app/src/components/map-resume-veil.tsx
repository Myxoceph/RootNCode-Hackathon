import { fontFamily, palette, spacing, Text } from "@vagabonds/ui";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useMapTheme } from "@/map";

/**
 * The app's night look, as its opening logo has it in the dark theme: light gold on night blue. The
 * same in both themes, as the night map it dissolves into is.
 */
const LOOK = {
  background: palette.gece950,
  glow: palette.altin200,
  glowStrength: 0.16,
  gold: palette.altin200,
  rule: "rgba(231, 194, 106, 0.3)",
  symbol: require("../../assets/images/brand/symbol-light.png"),
} as const;

const SYMBOL_WIDTH = 104;
const SYMBOL_SHAPE = 1255 / 947;
const MAX_NAME = 64;
/** A letter's width for its height in this type, about: enough to fit a long name on one line. */
const LETTER = 0.6;
const SIDE = spacing.xl;
/** The ornament under the name: two fine lines either side of a star, a light running along them. */
const RULE_MAX = 220;
const STAR = 12;
const BREATH_MS = 2600;
const SHINE_MS = 1800;

/**
 * What a city opened again comes in behind: the app's symbol breathing slowly in a soft gold light,
 * the city's name under it, and a fine gold rule with a star at its middle, a light running along it
 * while the map gets ready. Night in both themes, as the map is. All of it moves on the UI thread, so the map's loading
 * does not touch it; with reduced motion it stands still.
 */
export function MapResumeVeil({ city, line, bottom }: { city: string; line: string; bottom: number }) {
  // The night map's colours, keeping "Yüksek kontrast".
  const { colors: c } = useMapTheme();
  const look = LOOK;
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const breath = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      rise.setValue(1);
      return;
    }
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const shining = Animated.loop(Animated.timing(shine, { toValue: 1, duration: SHINE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    breathing.start();
    shining.start();
    Animated.timing(rise, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    return () => {
      breathing.stop();
      shining.stop();
    };
  }, [reduced, breath, shine, rise]);

  const nameSize = Math.min(MAX_NAME, (width - SIDE * 2) / (Math.max(city.length, 1) * LETTER));
  const rule = Math.min(RULE_MAX, width - SIDE * 2);
  const half = (rule - STAR * 2 - spacing.sm * 2) / 2;
  const shineWidth = half * 0.6;
  const glow = SYMBOL_WIDTH * 3.2;

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: look.background, paddingBottom: bottom }]}
      onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}
    >
      {width > 0 && (
        <Animated.View
          style={[
            styles.center,
            { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
          ]}
        >
          <View style={styles.symbolStage}>
            {/* A soft gold light behind the symbol, swelling with it. */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.glow,
                {
                  width: glow,
                  height: glow,
                  marginLeft: -glow / 2,
                  marginTop: -glow / 2,
                  opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
                  transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }],
                },
              ]}
            >
              <Svg width={glow} height={glow}>
                <Defs>
                  <RadialGradient id="veil-glow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={look.glow} stopOpacity={look.glowStrength} />
                    <Stop offset="1" stopColor={look.glow} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Rect width={glow} height={glow} fill="url(#veil-glow)" />
              </Svg>
            </Animated.View>
            <Animated.View style={{ transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }] }}>
              <Image source={look.symbol} style={styles.symbol} resizeMode="contain" />
            </Animated.View>
          </View>

          <Text colorValue={c.text} numberOfLines={1} style={[styles.name, { fontSize: nameSize, lineHeight: nameSize * 1.15, letterSpacing: -nameSize * 0.02 }]}>
            {city}
          </Text>

          <View style={[styles.rule, { width: rule }]}>
            {[0, 1].map((side) => (
              <View key={side} style={[styles.ruleLine, { width: half, backgroundColor: look.rule }]}>
                {!reduced && (
                  <Animated.View
                    style={[
                      styles.shine,
                      {
                        width: shineWidth,
                        backgroundColor: look.gold,
                        // From the star outward on both sides, as if the light spreads from it.
                        transform: [
                          {
                            translateX: shine.interpolate({
                              inputRange: [0, 1],
                              outputRange: side === 0 ? [half, -shineWidth] : [-shineWidth, half],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                )}
              </View>
            ))}
            <View style={[styles.star, { left: half + spacing.sm }]}>
              <Svg width={STAR * 2} height={STAR * 2} viewBox="0 0 24 24">
                <Path d="M12 1.5l2.6 5.2 5.8-1.6-1.6 5.8L24 12l-5.2 2.6 1.6 5.8-5.8-1.6L12 24l-2.6-5.2-5.8 1.6 1.6-5.8L0 12l5.2-2.6-1.6-5.8 5.8 1.6Z" fill={look.gold} />
              </Svg>
            </View>
          </View>

          <Text colorValue={c.textSecondary} style={styles.line}>
            {line}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    overflow: "hidden",
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    paddingHorizontal: SIDE,
  },
  symbolStage: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  glow: {
    position: "absolute",
    top: "50%",
    left: "50%",
  },
  symbol: {
    width: SYMBOL_WIDTH,
    height: SYMBOL_WIDTH / SYMBOL_SHAPE,
  },
  name: {
    fontFamily: fontFamily.display,
    textAlign: "center",
  },
  rule: {
    height: STAR * 2,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ruleLine: {
    height: 1.5,
    overflow: "hidden",
    borderRadius: 1,
  },
  shine: {
    height: "100%",
    borderRadius: 1,
  },
  star: {
    position: "absolute",
    top: 0,
  },
  line: {
    marginTop: spacing.md,
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
