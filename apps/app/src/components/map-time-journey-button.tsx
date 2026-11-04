import Ionicons from "@expo/vector-icons/Ionicons";
import { fontFamily, palette, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from "react-native";

import { useReducedMotion } from "@/lib/use-reduced-motion";

const USE_NATIVE = Platform.OS !== "web";
/** The rim breathes this many times when the map opens, then rests. */
const BEATS = 3;

/**
 * Zamanda Yolculuk from the map: a gold button floating over its foot. In the Turkey view it is
 * wide, with a line under its name, centred; over a city's cards it shrinks to the right. A gold
 * ring breathes a few times as the map opens, so it is noticed; not with reduced motion.
 *
 * Gold altin300 with gece950 on it (above 7:1), as the tour's bubbles over the night map.
 */
export function MapTimeJourneyButton({ bottom, compact }: { bottom: number; compact: boolean }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const pulse = Animated.sequence([
      Animated.delay(900),
      Animated.loop(Animated.timing(beat, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE }), { iterations: BEATS }),
    ]);
    pulse.start();
    return () => pulse.stop();
  }, [beat, reduced]);

  return (
    <View style={[styles.wrap, compact ? styles.right : styles.centre, { bottom }]} pointerEvents="box-none">
      {!reduced && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: beat.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.8, 0] }),
              transform: [{ scaleX: beat.interpolate({ inputRange: [0, 1], outputRange: [1, compact ? 1.25 : 1.12] }) }, { scaleY: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
            },
          ]}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zamanda yolculuk"
        accessibilityHint="Eserleri yapıldıkları yüzyıllara göre gezersin"
        onPress={() => router.push("/time-journey")}
        style={({ pressed }) => [styles.button, compact && styles.buttonCompact, pressed && styles.pressed]}
      >
        <View style={[styles.disc, compact && styles.discCompact]}>
          <Ionicons name="hourglass-outline" size={compact ? 16 : 19} color={palette.altin200} />
        </View>
        <View style={styles.words}>
          <Text variant="label" colorValue={palette.gece950} numberOfLines={1} style={styles.title}>
            Zamanda yolculuk
          </Text>
          {!compact && (
            <Text colorValue={palette.gece950} numberOfLines={1} style={styles.line}>
              Eserleri yüzyıllar boyunca keşfet
            </Text>
          )}
        </View>
        {!compact && (
          <View style={styles.arrow}>
            <Ionicons name="arrow-forward" size={16} color={palette.altin200} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  centre: {
    left: spacing.lg,
    right: spacing.lg,
  },
  right: {
    right: spacing.lg,
  },
  ring: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: palette.altin200,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 60,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: radius.full,
    backgroundColor: palette.altin300,
    // Lifted off the night map.
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  buttonCompact: {
    minHeight: touchTarget.min + 4,
    paddingLeft: 6,
    paddingRight: spacing.md,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  disc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.gece950,
  },
  discCompact: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  words: {
    flexShrink: 1,
  },
  title: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
    lineHeight: 20,
  },
  line: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.8,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.gece950,
  },
});
