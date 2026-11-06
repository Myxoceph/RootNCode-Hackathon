import Ionicons from "@expo/vector-icons/Ionicons";
import { cameraColors, fontFamily, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import Head from "expo-router/head";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Rect } from "react-native-svg";

import { toggleCapsule, useCapsulePlayer } from "@/audio/capsule-player";
import { CAPSULE_SECONDS, captionAt, capsuleTypes, capsuleWords, formatSeconds, type CapsuleType } from "@/content/capsules";
import { useLang, useMessages } from "@/i18n";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useA11ySettings } from "@/settings/a11y-settings";

/**
 * Sesli Zaman Kapsülü (module 7): a 24-second ambience of a building's former
 * use. Captions are on by default and turn every sound event into text.
 */
export default function CapsuleScreen() {
  const m = useMessages();
  const w = m.capsule;
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<CapsuleType>("sifahane");
  const player = useCapsulePlayer();
  const { settings, setSetting } = useA11ySettings();

  const mine = player?.type === type ? player : null;
  const elapsed = mine?.elapsed ?? 0;
  const capsule = useMemo(() => capsuleWords(type, lang), [type, lang]);

  const choose = (next: CapsuleType) => {
    setType(next);
    // Switching type while something plays moves playback to the new one.
    if (player && player.type !== next) toggleCapsule(next);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <Head>
        <title>{m.common.title(w.title)}</title>
      </Head>
      <Text variant="overline" colorValue={cameraColors.textSecondary} headingLevel={1}>
        {w.overline}
      </Text>

      <View accessibilityRole="radiogroup" accessibilityLabel={w.kindLabel} style={styles.types}>
        {capsuleTypes.map((key) => {
          const on = key === type;
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              aria-checked={on}
              onPress={() => choose(key)}
              style={[styles.type, on && styles.typeOn]}
            >
              <Text variant="label" colorValue={on ? cameraColors.onGold : cameraColors.text}>
                {capsuleWords(key, lang).name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Visualizer />

      <View style={styles.info}>
        <Text variant="title" colorValue={cameraColors.text} style={styles.center} headingLevel={2}>
          {capsule.name}
        </Text>
        <Text colorValue={cameraColors.textSecondary} style={styles.center}>
          {capsule.description}
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mine ? m.common.stop : w.play(capsule.name)}
          onPress={() => toggleCapsule(type)}
          style={styles.play}
        >
          <Ionicons name={mine ? "pause" : "play"} size={24} color={cameraColors.onGold} />
        </Pressable>
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={w.playback}
          accessibilityValue={{ min: 0, max: CAPSULE_SECONDS, now: Math.floor(elapsed) }}
        >
          <View style={[styles.progressFill, { width: `${(elapsed / CAPSULE_SECONDS) * 100}%` }]} />
        </View>
        <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.mono}>
          {`${formatSeconds(elapsed)} / ${formatSeconds(CAPSULE_SECONDS)}`}
        </Text>
      </View>

      <View style={styles.captions}>
        <View style={styles.captionsHead}>
          <Text variant="overline" colorValue={cameraColors.textSecondary}>
            {w.captionsHead}
          </Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={w.captions}
            aria-checked={settings.captions}
            onPress={() => setSetting("captions", !settings.captions)}
            style={[styles.cc, settings.captions && styles.ccOn]}
          >
            <Text variant="caption" colorValue={settings.captions ? cameraColors.background : cameraColors.text} style={styles.ccText}>
              CC
            </Text>
          </Pressable>
        </View>
        <Text
          accessibilityLiveRegion="polite"
          colorValue={settings.captions ? cameraColors.text : cameraColors.textSecondary}
          style={settings.captions ? styles.mono : styles.italic}
        >
          {settings.captions ? captionAt(type, elapsed, lang) : w.captionsOff}
        </Text>
        {mine && !mine.loading && !mine.audible && (
          <Text variant="caption" colorValue={cameraColors.textSecondary}>
            {w.silent}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const BARS = 48;
const SIZE = 200;

/** A ring that breathes slowly; the star stays still at its center. */
function Visualizer() {
  const reduceMotion = useReducedMotion();
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: BARS }, () => 0.2));

  useEffect(() => {
    if (reduceMotion) return;
    let frame = 0;
    let last = 0;
    const t0 = Date.now();
    const tick = () => {
      const now = Date.now();
      // ~20 updates a second is enough for the eye and keeps the SVG re-render cheap.
      if (now - last > 50) {
        last = now;
        setLevels(Array.from({ length: BARS }, (_, i) => 0.18 + 0.12 * Math.sin(i * 0.9 + (now - t0) / 1600)));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  return (
    <View style={styles.viz} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={SIZE} height={SIZE} viewBox="-100 -100 200 200">
        {levels.map((v, i) => {
          const a = (i / BARS) * Math.PI * 2;
          const r0 = 50;
          const r1 = r0 + 6 + v * 38;
          return (
            <Line
              key={i}
              x1={Math.cos(a) * r0}
              y1={Math.sin(a) * r0}
              x2={Math.cos(a) * r1}
              y2={Math.sin(a) * r1}
              stroke={cameraColors.gold}
              strokeOpacity={0.35 + v * 0.6}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          );
        })}
        <G stroke={cameraColors.gold} strokeWidth={1.6} fill="none">
          <Rect x={-22} y={-22} width={44} height={44} />
          <Rect x={-22} y={-22} width={44} height={44} transform="rotate(45)" />
        </G>
        <Circle r={4} fill={cameraColors.gold} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: cameraColors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  center: {
    textAlign: "center",
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
  italic: {
    fontStyle: "italic",
  },
  types: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  type: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  typeOn: {
    backgroundColor: cameraColors.gold,
    borderColor: cameraColors.gold,
  },
  viz: {
    alignSelf: "center",
    width: SIZE,
    height: SIZE,
  },
  info: {
    gap: spacing.xs,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  play: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: cameraColors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  progress: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: cameraColors.gold,
  },
  captions: {
    minHeight: 110,
    backgroundColor: cameraColors.panel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  captionsHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cc: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  ccOn: {
    backgroundColor: cameraColors.text,
  },
  ccText: {
    fontFamily: fontFamily.monoMedium,
  },
});
