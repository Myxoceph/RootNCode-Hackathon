import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BuildingIllustration } from "@/components/building-illustration";
import { CameraTopBar, GlassIconButton } from "@/components/camera-chrome";
import { Slider } from "@/components/slider";
import { timeCurtain } from "@/content/camera";
import { speak } from "@/lib/speak";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useA11ySettings } from "@/settings/a11y-settings";

/** Alignment at which the shutter turns gold and says "Şimdi çek". */
const READY_AT = 90;

/**
 * Zaman Perdesi (module 1). The archive photo floats over the viewfinder as a
 * ghost; once the frame is aligned the shutter turns gold. After the shot the
 * screen splits into a before/after curtain.
 *
 * The viewfinder is simulated with the design's drawing until the camera
 * integration and the archive photo land (Y-tasks, H8). On the web there is
 * no camera (ADR 0001), so it opens directly on the curtain.
 */
export default function TimeCurtainScreen() {
  const insets = useSafeAreaInsets();
  const web = Platform.OS === "web";
  const [mode, setMode] = useState<"camera" | "compare">(web ? "compare" : "camera");
  const { settings } = useA11ySettings();

  return (
    <View style={styles.screen}>
      <Head>
        <title>Zaman Perdesi · Vagabonds</title>
      </Head>
      {mode === "camera" ? <Viewfinder onShoot={() => setMode("compare")} /> : <Curtain onRetake={web ? null : () => setMode("camera")} />}
      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title={timeCurtain.monument} subtitle={`Arşiv karesi · ${timeCurtain.archiveLabel}`}>
          {settings.audioDescription && (
            <GlassIconButton icon="volume-high-outline" label="Sesli mimari betimleme" onPress={() => speak(timeCurtain.audioDescription)} />
          )}
        </CameraTopBar>
      </View>
    </View>
  );
}

function Viewfinder({ onShoot }: { onShoot: () => void }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [ghost, setGhost] = useState(35);
  const [alignment, setAlignment] = useState(94);
  const shake = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  // Simulated hand shake: the live image drifts, and alignment follows how far it is off.
  useEffect(() => {
    if (reduceMotion) {
      shake.setValue({ x: 0, y: 0 });
      tilt.setValue(0);
      setAlignment(94);
      return;
    }
    let frame = 0;
    let lastReport = 0;
    const t0 = Date.now();
    const loop = () => {
      const t = (Date.now() - t0) / 1000;
      const amp = 0.15 + 0.85 * Math.abs(Math.sin(t * 0.42)) ** 1.6;
      const dx = (Math.sin(t * 0.9) * 7 + Math.sin(t * 2.3) * 2) * amp;
      const dy = (Math.cos(t * 0.7) * 5 + Math.sin(t * 1.7) * 1.5) * amp;
      const r = Math.sin(t * 0.5) * 1.4 * amp;
      shake.setValue({ x: dx, y: dy });
      tilt.setValue(r);
      if (t - lastReport > 0.1) {
        lastReport = t;
        setAlignment(Math.max(40, Math.min(99, Math.round(100 - (Math.abs(dx) + Math.abs(dy)) * 2.6 - Math.abs(r) * 6))));
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, shake, tilt]);

  const ready = alignment >= READY_AT;

  const shoot = () => {
    if (reduceMotion) return onShoot();
    flash.setValue(0.9);
    Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }).start(onShoot);
  };

  return (
    <View style={styles.fill}>
      <Animated.View
        style={[
          styles.fill,
          {
            transform: [
              ...shake.getTranslateTransform(),
              { rotate: tilt.interpolate({ inputRange: [-10, 10], outputRange: ["-10deg", "10deg"] }) },
              { scale: 1.03 },
            ],
          },
        ]}
      >
        <BuildingIllustration mode="now" id="live" />
      </Animated.View>
      <View style={[styles.fill, { opacity: ghost / 100 }]} pointerEvents="none">
        <BuildingIllustration mode="past" id="ghost" />
      </View>

      {/* Guides sit on the minaret and the drum of the dome. */}
      <View pointerEvents="none" style={[styles.guideV, { borderColor: cameraColors.gold }]} />
      <View pointerEvents="none" style={[styles.guideH, { borderColor: cameraColors.gold }]} />

      <View
        style={[styles.alignPill, { top: insets.top + 76 }]}
        accessible
        accessibilityLabel={`${ready ? "Şimdi çek" : "Minareyi kılavuza oturt"}, hizalama yüzde ${alignment}`}
      >
        <Text variant="caption" colorValue={cameraColors.text}>
          {ready ? "Şimdi çek" : "Minareyi kılavuza oturt"}
        </Text>
        <Text variant="caption" colorValue={cameraColors.gold} style={styles.mono}>
          {`%${alignment}`}
        </Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.opacityRow}>
          <Text variant="caption" colorValue={cameraColors.textSecondary}>
            Şablon
          </Text>
          <Slider
            value={ghost}
            min={20}
            max={60}
            step={5}
            onChange={setGhost}
            label="Şablon opaklığı"
            valueText={`%${ghost}`}
            trackColor="rgba(255,255,255,0.2)"
            fillColor={cameraColors.gold}
            thumbColor={cameraColors.gold}
            style={styles.flex}
          />
          <Text variant="caption" colorValue={cameraColors.text} style={[styles.mono, styles.value]}>
            {`%${ghost}`}
          </Text>
        </View>
        <View style={styles.shutterRow}>
          <View style={styles.thumb} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <BuildingIllustration mode="past" id="thumb" />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ready ? "Fotoğrafı çek, kare hizalı" : "Fotoğrafı çek"}
            onPress={shoot}
            style={[styles.shutter, { borderColor: ready ? cameraColors.gold : cameraColors.text }]}
          >
            <View style={[styles.shutterInner, { backgroundColor: ready ? cameraColors.gold : cameraColors.text }]} />
          </Pressable>
          <Text variant="caption" colorValue={cameraColors.textSecondary} style={[styles.mono, styles.years]}>
            {`${timeCurtain.archiveLabel}\n→ 2026`}
          </Text>
        </View>
      </View>
      <Animated.View pointerEvents="none" style={[styles.fill, styles.flash, { opacity: flash }]} />
    </View>
  );
}

/** Before/after: left of the handle is the archive, right is today. */
function Curtain({ onRetake }: { onRetake: (() => void) | null }) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(50);
  const widthRef = useRef(0);
  widthRef.current = width;
  const { settings } = useA11ySettings();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility("Zaman perdesi açıldı. Sol eski, sağ bugün.");
  }, []);

  const fromX = (x: number) => {
    if (widthRef.current > 0) setPos(Math.round(Math.min(100, Math.max(0, (x / widthRef.current) * 100))));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => fromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => fromX(e.nativeEvent.locationX),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const step = (delta: number) => setPos((p) => Math.min(100, Math.max(0, p + delta)));
  const onAction = (e: AccessibilityActionEvent) => step(e.nativeEvent.actionName === "increment" ? 10 : -10);
  const webKeys =
    Platform.OS === "web"
      ? ({
          tabIndex: 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (e.key === "ArrowRight") step(5);
            else if (e.key === "ArrowLeft") step(-5);
            else return;
            e.preventDefault();
          },
        } as object)
      : {};

  return (
    <View style={styles.fill}>
      <View
        style={styles.compare}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Zaman perdesini kaydır: sol eski, sağ bugün"
        accessibilityValue={{ min: 0, max: 100, now: pos, text: `Arşiv yüzde ${pos}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={onAction}
        {...webKeys}
        {...pan.panHandlers}
      >
        <View style={styles.fill} pointerEvents="none">
          <BuildingIllustration mode="now" id="now" />
        </View>
        <View style={[styles.pastClip, { width: `${pos}%` }]} pointerEvents="none">
          <View style={{ width, height: "100%" }}>
            <BuildingIllustration mode="past" id="past" />
          </View>
        </View>
        <View pointerEvents="none" style={[styles.handle, { left: `${pos}%` }]}>
          <View style={styles.knob}>
            <Text variant="label" colorValue={cameraColors.background}>
              ‹ ›
            </Text>
          </View>
        </View>
        <View pointerEvents="none" style={[styles.tag, styles.tagLeft, { top: insets.top + 76 }]}>
          <Text variant="caption" colorValue={cameraColors.text} style={styles.mono}>
            {timeCurtain.archiveLabel}
          </Text>
        </View>
        <View pointerEvents="none" style={[styles.tag, styles.tagRight, { top: insets.top + 76 }]}>
          <Text variant="caption" colorValue={cameraColors.text} style={styles.mono}>
            Bugün
          </Text>
        </View>
      </View>
      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text variant="overline" colorValue={cameraColors.textSecondary}>
          ZAMAN PERDESİ AÇILDI
        </Text>
        <Text variant="heading" colorValue={cameraColors.text} headingLevel={2}>
          Yüz yıl, aynı açıdan
        </Text>
        <Text variant="caption" colorValue={cameraColors.textSecondary}>
          {`Perdeyi sürükle: solda ${timeCurtain.archiveLabel} arşivi, sağda ${onRetake ? "az önce çektiğin kare" : "bugünkü kare"}.`}
        </Text>
        <View style={styles.buttons}>
          {onRetake && (
            <Button
              label="Yeniden çek"
              onPress={onRetake}
              colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]}
              style={styles.flex}
            />
          )}
          {settings.audioDescription && (
            <Button
              label="Sesli betimle"
              onPress={() => speak(timeCurtain.audioDescription)}
              colors={[cameraColors.gold, cameraColors.onGold]}
              style={styles.flex}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: cameraColors.background,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  flex: {
    flex: 1,
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
  top: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 720,
    alignSelf: "center",
  },
  guideV: {
    position: "absolute",
    top: "25%",
    bottom: "25%",
    left: "82.8%",
    borderLeftWidth: 1.5,
    borderStyle: "dashed",
    opacity: 0.7,
  },
  guideH: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    top: "50%",
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    opacity: 0.7,
  },
  alignPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: cameraGlass,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    gap: spacing.md,
    backgroundColor: "rgba(4,6,10,0.72)",
  },
  opacityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  value: {
    width: 44,
    textAlign: "right",
  },
  shutterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    overflow: "hidden",
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    padding: 4,
  },
  shutterInner: {
    flex: 1,
    borderRadius: 32,
  },
  years: {
    width: 64,
    textAlign: "right",
  },
  flash: {
    backgroundColor: "#fff",
  },
  compare: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 220,
    overflow: "hidden",
  },
  pastClip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: cameraColors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  knob: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cameraColors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  tag: {
    position: "absolute",
    backgroundColor: cameraGlass,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  tagLeft: {
    left: spacing.md,
  },
  tagRight: {
    right: spacing.md,
  },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 220,
    backgroundColor: cameraColors.panel,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    maxWidth: 560,
  },
});
