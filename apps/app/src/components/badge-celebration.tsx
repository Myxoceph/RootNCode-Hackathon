import { fontFamily, palette, radius, spacing, Text } from "@vagabonds/ui";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

import { BadgeArt } from "@/components/badge-art";
import { dismissAllBadges, dismissBadge, useNewBadges, type NewBadge } from "@/data/new-badges";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { cue } from "@/lib/feedback";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/**
 * The moment a badge is earned, over whatever screen it was earned on: a night scene where the
 * badge turns in grey, its colour breaks out with a wave and confetti, and its name, line and
 * points rise under it. Several at once come one after another. With reduced motion it only fades.
 *
 * Fixed colours, as the badges' own night (the same in light and dark theme): gece50 / gece300 /
 * altin200 text on the navy are all above 7:1.
 */
export function BadgeCelebration() {
  const queue = useNewBadges();
  const badge = queue[0];
  return (
    <Modal visible={badge !== undefined} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={dismissAllBadges}>
      {/* The scene is always night: light status bar icons over it. */}
      {badge && <StatusBar style="light" />}
      {badge && <Scene key={badge.code} badge={badge} left={queue.length - 1} />}
    </Modal>
  );
}

const MEDAL = 156;
const STAGE = 340;
const USE_NATIVE = Platform.OS !== "web";

const CONFETTI_COLORS = [palette.altin200, palette.altin300, palette.gulkurusu300, palette.kobalt300, palette.mercan300, palette.gece50];

/** The confetti, the same every time: an angle, how far it flies, its spin, shape and colour. */
function confetti(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = (i * 137.508) % 360; // golden angle: evenly spread without a pattern
    const angle = (t * Math.PI) / 180;
    const far = 110 + ((i * 53) % 90);
    return {
      dx: Math.cos(angle) * far,
      dy: Math.sin(angle) * far * 0.85 - 30,
      fall: 90 + ((i * 29) % 70),
      spin: (i % 2 === 0 ? 1 : -1) * (240 + ((i * 47) % 360)),
      shape: i % 3,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      size: 5 + (i % 4),
    };
  });
}

function Scene({ badge, left }: { badge: NewBadge; left: number }) {
  const m = useMessages();
  const w = m.badges;
  const reduced = useReducedMotion();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pieces = useMemo(() => confetti(34), []);

  const fade = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const [points, setPoints] = useState(0);

  useEffect(() => {
    announce(w.newBadgeSaid(badge.title, badge.points, left));
  }, [badge, left]);

  // Once a badge, not again for the "left" count changing under it.
  useEffect(() => {
    cue("badge");
  }, [badge]);

  useEffect(() => {
    if (reduced) {
      // The setting is read after the first render: the points are set here, not counted.
      setPoints(badge.points);
      for (const value of [enter, reveal, words]) value.setValue(1);
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: USE_NATIVE }).start();
      return;
    }
    const count = new Animated.Value(0);
    const id = count.addListener(({ value }) => setPoints(Math.round(value)));
    const loops = [
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 26_000, easing: Easing.linear, useNativeDriver: USE_NATIVE })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: USE_NATIVE }),
          Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: USE_NATIVE }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(twinkle, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE }),
          Animated.timing(twinkle, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE }),
        ]),
      ),
    ];
    const show = Animated.sequence([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: USE_NATIVE }),
      // The badge turns in, still grey…
      // A set time with a little overshoot rather than a spring: the steps after it start on time.
      Animated.timing(enter, { toValue: 1, duration: 950, easing: Easing.out(Easing.back(1.4)), useNativeDriver: USE_NATIVE }),
      // …then its colour breaks out, with the wave and the confetti.
      Animated.parallel([
        Animated.timing(reveal, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }),
        Animated.timing(burst, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE }),
        Animated.sequence([
          Animated.delay(180),
          Animated.parallel([
            Animated.timing(words, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }),
            Animated.timing(count, { toValue: badge.points, duration: 900, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
          ]),
        ]),
      ]),
    ]);
    show.start();
    for (const loop of loops) loop.start();
    return () => {
      show.stop();
      for (const loop of loops) loop.stop();
      count.removeListener(id);
    };
  }, [badge.points, burst, enter, fade, float, reduced, reveal, spin, twinkle, words]);

  const rise = (from: number, to: number) => ({
    opacity: words.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: "clamp" }),
    transform: [{ translateY: words.interpolate({ inputRange: [from, to], outputRange: [14, 0], extrapolate: "clamp" }) }],
  });

  const screen = useWindowDimensions();
  const glowX = screen.width / 2;
  const glowY = screen.height * 0.4;
  const glowR = Math.max(screen.width, screen.height) * 0.6;

  const last = left === 0;
  const close = () => dismissAllBadges();
  const next = () => {
    if (!last) return dismissBadge();
    dismissAllBadges();
    router.navigate("/profile/badges");
  };

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
      {/* In pixels, not percentages: on Android a percentage glow was cut off at a straight edge. */}
      <Svg width={screen.width} height={screen.height} style={styles.glow} aria-hidden pointerEvents="none">
        <Defs>
          <RadialGradient id="cel-glow" gradientUnits="userSpaceOnUse" cx={glowX} cy={glowY} r={glowR}>
            <Stop offset="0" stopColor={palette.altin200} stopOpacity={0.28} />
            <Stop offset="0.55" stopColor={palette.kobalt700} stopOpacity={0.12} />
            <Stop offset="1" stopColor="#050916" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={glowX} cy={glowY} r={glowR} fill="url(#cel-glow)" />
      </Svg>

      <View style={styles.column}>
        <View style={styles.stage} aria-hidden pointerEvents="none">
          {/* Slow light behind the badge. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
                transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }],
              },
            ]}
          >
            <Rays />
          </Animated.View>

          {/* The wave as the colour breaks out. */}
          {!reduced &&
            [0, 0.18].map((delay) => (
              <Animated.View
                key={delay}
                style={[
                  styles.wave,
                  {
                    opacity: reveal.interpolate({ inputRange: [0, delay + 0.01, 1], outputRange: [0, 0.7, 0], extrapolate: "clamp" }),
                    transform: [{ scale: reveal.interpolate({ inputRange: [0, delay, 1], outputRange: [0.7, 0.7, 2.1], extrapolate: "clamp" }) }],
                  },
                ]}
              />
            ))}

          {!reduced &&
            pieces.map((piece, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.piece,
                  piece.shape === 0 && { width: piece.size + 4, height: piece.size / 2 + 1, borderRadius: 1 },
                  piece.shape === 1 && { width: piece.size, height: piece.size, borderRadius: piece.size / 2 },
                  piece.shape === 2 && { width: piece.size, height: piece.size, borderRadius: 1 },
                  {
                    backgroundColor: piece.color,
                    opacity: burst.interpolate({ inputRange: [0, 0.04, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                    transform: [
                      { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, piece.dx] }) },
                      { translateY: burst.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, piece.dy, piece.dy + piece.fall] }) },
                      { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${piece.spin}deg`] }) },
                      { scale: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1, 0.8] }) },
                    ],
                  },
                ]}
              />
            ))}

          {/* The badge: turns in grey, then its colour comes through; afterwards it floats. */}
          <Animated.View
            style={{
              opacity: enter.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
              transform: [
                { perspective: 800 },
                { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
                { rotateY: enter.interpolate({ inputRange: [0, 1], outputRange: ["-180deg", "0deg"] }) },
              ],
            }}
          >
            <Medal badge={badge} reveal={reveal} />
          </Animated.View>

          {!reduced &&
            SPARKLES.map((sparkle, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.sparkle,
                  {
                    left: STAGE / 2 + sparkle.x - sparkle.size / 2,
                    top: STAGE / 2 + sparkle.y - sparkle.size / 2,
                    opacity: Animated.multiply(reveal, twinkle.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [1, 0.25] : [0.25, 1] })),
                    transform: [{ scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: i % 2 ? [1, 0.6] : [0.6, 1] }) }],
                  },
                ]}
              >
                <Star size={sparkle.size} />
              </Animated.View>
            ))}
        </View>

        <Animated.View style={[styles.words, rise(0, 0.5)]}>
          <Text colorValue={palette.altin200} style={styles.overline}>
            {w.newBadge}
          </Text>
        </Animated.View>
        <Animated.View style={rise(0.15, 0.65)}>
          <Text variant="title" headingLevel={2} colorValue={palette.gece50} style={styles.title}>
            {badge.title}
          </Text>
        </Animated.View>
        <Animated.View style={rise(0.3, 0.8)}>
          <Text colorValue={palette.gece300} style={styles.description}>
            {badge.description}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.pointsRow, rise(0.45, 1)]}>
          <View style={styles.points}>
            <Text colorValue={palette.altin200} style={styles.pointsText}>{w.pointsGained(points)}</Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.actions, rise(0.6, 1)]}>
          <Pressable accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text variant="label" colorValue={palette.altin950} style={styles.primaryText}>
              {last ? w.seeBadges : w.nextBadge(left)}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text variant="label" colorValue={palette.gece50}>
              {last ? m.common.close : w.closeAll}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** The badge in its gold rim: the grey face first, the colour one laid over it as `reveal` grows. */
function Medal({ badge, reveal }: { badge: NewBadge; reveal: Animated.Value }) {
  const rim = MEDAL + 16;
  return (
    <View style={{ width: rim, height: rim, alignItems: "center", justifyContent: "center" }}>
      <Svg width={rim} height={rim} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="cel-foil" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#F6DE9C" />
            <Stop offset="0.45" stopColor={palette.altin600} />
            <Stop offset="0.7" stopColor={palette.altin200} />
            <Stop offset="1" stopColor={palette.altin700} />
          </LinearGradient>
        </Defs>
        <Circle cx={rim / 2} cy={rim / 2} r={rim / 2 - 3} stroke="url(#cel-foil)" strokeWidth={4} fill="#0B172D" />
      </Svg>
      <View style={styles.face}>
        <BadgeArt code={badge.code} emoji={badge.badge} size={MEDAL} earned={false} />
      </View>
      <Animated.View style={[styles.face, { opacity: reveal }]}>
        <BadgeArt code={badge.code} emoji={badge.badge} size={MEDAL} />
      </Animated.View>
    </View>
  );
}

/** Eighteen soft gold rays from the middle of the stage. */
function Rays() {
  const c = STAGE / 2;
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const w = Math.PI / 36;
    const p = (angle: number, r: number) => `${(c + Math.cos(angle) * r).toFixed(1)} ${(c + Math.sin(angle) * r).toFixed(1)}`;
    return `M${c} ${c} L${p(a - w, c)} L${p(a + w, c)} Z`;
  });
  return (
    <Svg width={STAGE} height={STAGE}>
      <Defs>
        <RadialGradient id="cel-ray" cx="50%" cy="50%" r="50%">
          <Stop offset="0.25" stopColor={palette.altin200} stopOpacity={0.5} />
          <Stop offset="1" stopColor={palette.altin200} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {rays.map((d, i) => (
        <Path key={i} d={d} fill="url(#cel-ray)" opacity={i % 2 ? 0.55 : 1} />
      ))}
    </Svg>
  );
}

const SPARKLES = [
  { x: -104, y: -78, size: 18 },
  { x: 112, y: -54, size: 14 },
  { x: -92, y: 96, size: 12 },
  { x: 100, y: 88, size: 20 },
  { x: 6, y: -128, size: 12 },
];

/** The four-pointed star over every badge. */
function Star({ size }: { size: number }) {
  const h = size / 2;
  const w = size * 0.14;
  return (
    <Svg width={size} height={size}>
      <Path d={`M${h} 0 Q${h + w} ${h - w} ${size} ${h} Q${h + w} ${h + w} ${h} ${size} Q${h - w} ${h + w} 0 ${h} Q${h - w} ${h - w} ${h} 0 Z`} fill={palette.gece50} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#050916",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  column: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: -spacing.lg,
  },
  wave: {
    position: "absolute",
    width: MEDAL + 16,
    height: MEDAL + 16,
    borderRadius: (MEDAL + 16) / 2,
    borderWidth: 3,
    borderColor: palette.altin200,
  },
  piece: {
    position: "absolute",
  },
  sparkle: {
    position: "absolute",
  },
  face: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  words: {
    marginBottom: spacing.xs,
  },
  overline: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 3,
    textAlign: "center",
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginTop: spacing.xs,
    maxWidth: 340,
  },
  pointsRow: {
    marginTop: spacing.md,
  },
  points: {
    paddingHorizontal: spacing.md,
    height: 34,
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(231, 194, 106, 0.45)",
    backgroundColor: "rgba(231, 194, 106, 0.1)",
  },
  // Sans figures: the display face draws its zero as a ring.
  pointsText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 16,
    lineHeight: 22,
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  primary: {
    minHeight: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.altin200,
  },
  primaryText: {
    fontFamily: fontFamily.sansBold,
  },
  secondary: {
    minHeight: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  pressed: {
    opacity: 0.8,
  },
});
