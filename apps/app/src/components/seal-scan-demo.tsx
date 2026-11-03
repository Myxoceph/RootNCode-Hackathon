import Ionicons from "@expo/vector-icons/Ionicons";
import { cameraColors, fontFamily, palette, spacing, Text } from "@vagabonds/ui";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { BuildingIllustration } from "@/components/building-illustration";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const FRAME_WIDTH = 240;
const FRAME_HEIGHT = 360;
/** The marked part of the building (its portal), inside the frame. */
const TARGET = { left: 70, top: 168, width: 100, height: 120 };
/** The line sweeps over the marked part this many times before it is recognised. */
const SWEEPS = 2;
const SWEEP_MS = 1100;
/** "Tanındı" stays this long before the map takes over. */
const RECOGNISED_MS = 1800;

const ink = cameraColors;

/**
 * An example of Ziyaret Mührü for the map tour, instead of opening the camera: a phone's viewfinder
 * over a drawn mosque, gold corners around its marked part, a line sweeping over it, then
 * "Tanındı" and `onDone`. Decorative apart from what it says aloud.
 */
export function SealScanDemo({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const found = useRef(new Animated.Value(0)).current;
  const [recognised, setRecognised] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    announce("Örnek: eserin işaretli kısmı kameraya tanıtılıyor.");
    const recognise = () => {
      setRecognised(true);
      announce("Tanındı.");
      Animated.spring(found, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    };
    let timer: ReturnType<typeof setTimeout>;
    const scan = Animated.sequence([
      Animated.timing(enter, { toValue: 1, duration: reduced ? 0 : 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ...(reduced
        ? [Animated.delay(900)]
        : [Animated.timing(sweep, { toValue: SWEEPS, duration: SWEEP_MS * SWEEPS, easing: Easing.linear, useNativeDriver: true })]),
    ]);
    scan.start(({ finished }) => {
      if (!finished) return;
      recognise();
      // Fades away rather than vanishing, so the map's scene follows on from it.
      timer = setTimeout(() => Animated.timing(enter, { toValue: 0, duration: reduced ? 0 : 320, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => done.current()), RECOGNISED_MS);
    });
    return () => {
      scan.stop();
      clearTimeout(timer);
    };
  }, [enter, sweep, found, reduced]);

  // Down and back up once per sweep.
  const lineY = sweep.interpolate({
    inputRange: Array.from({ length: SWEEPS * 2 + 1 }, (_, i) => i / 2),
    outputRange: Array.from({ length: SWEEPS * 2 + 1 }, (_, i) => (i % 2 === 0 ? 0 : TARGET.height - 2)),
  });
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const pop = found.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const mark = recognised ? ink.gold : palette.white;

  return (
    <Animated.View style={[styles.screen, { opacity: enter }]} aria-hidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.phone, { transform: [{ scale }] }]}>
        <View style={styles.frame}>
          <BuildingIllustration mode="now" id="tour-scan" />
          <View style={styles.example}>
            <Ionicons name="camera" size={12} color={palette.white} />
            <Text variant="caption" colorValue={palette.white} style={styles.exampleLabel}>
              Örnek
            </Text>
          </View>

          <View style={[styles.target, TARGET, recognised && { backgroundColor: "rgba(221, 181, 92, 0.18)" }]}>
            <Corner style={styles.topLeft} color={mark} />
            <Corner style={[styles.topRight, { transform: [{ rotate: "90deg" }] }]} color={mark} />
            <Corner style={[styles.bottomRight, { transform: [{ rotate: "180deg" }] }]} color={mark} />
            <Corner style={[styles.bottomLeft, { transform: [{ rotate: "270deg" }] }]} color={mark} />
            {!recognised && <Animated.View style={[styles.line, { backgroundColor: ink.gold, transform: [{ translateY: lineY }] }]} />}
          </View>

          {recognised && (
            <Animated.View style={[styles.badge, { backgroundColor: ink.gold, opacity: found, transform: [{ scale: pop }] }]}>
              <Ionicons name="checkmark" size={16} color={palette.gece950} />
              <Text variant="caption" colorValue={palette.gece950} style={styles.badgeLabel}>
                Tanındı
              </Text>
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/** One corner of the gold frame: drawn for the top left, turned for the others. */
function Corner({ style, color }: { style: object; color: string }) {
  return <View style={[styles.corner, { borderColor: color }, style]} />;
}

const CORNER = 22;

const styles = StyleSheet.create({
  screen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(6, 8, 13, 0.72)",
  },
  phone: {
    padding: 8,
    borderRadius: 36,
    backgroundColor: palette.gece800,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    borderRadius: 28,
    overflow: "hidden",
  },
  example: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(6, 8, 13, 0.55)",
  },
  exampleLabel: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  target: {
    position: "absolute",
    borderRadius: 6,
  },
  corner: {
    position: "absolute",
    width: CORNER,
    height: CORNER,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
  },
  topLeft: { top: 0, left: 0 },
  topRight: { top: 0, right: 0 },
  bottomRight: { bottom: 0, right: 0 },
  bottomLeft: { bottom: 0, left: 0 },
  line: {
    position: "absolute",
    left: 6,
    right: 6,
    top: 0,
    height: 2,
    borderRadius: 1,
    shadowColor: palette.altin300,
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  badge: {
    position: "absolute",
    alignSelf: "center",
    bottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  badgeLabel: {
    fontFamily: fontFamily.sansBold,
  },
});
