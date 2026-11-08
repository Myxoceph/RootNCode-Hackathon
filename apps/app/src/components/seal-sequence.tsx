import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetDetail, Media } from "@vagabonds/contracts";
import { cameraColors, cameraGlass, fontFamily, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { playCapsule, setCapsuleMuted, stopCapsule, useCapsulePlayer } from "@/audio/capsule-player";
import { AssetImage } from "@/components/asset-image";
import { capsuleForSoundKey, captionAt } from "@/content/capsules";
import { useLang, useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { scenePhotos, sealScenes, stepSeconds } from "@/lib/seal-scenes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useScreenReaderStatus } from "@/lib/use-screen-reader";
import { useA11ySettings } from "@/settings/a11y-settings";

const FADE_MS = 900;
/** How far a photo draws near over its step. */
const DRAW_NEAR = 1.1;
/** Past this many letters, a line takes a smaller size and a darker veil. */
const LONG_LINE = 120;
/** From this system text size on, the words cover the photo: a darker veil keeps them readable. */
const LARGE_TEXT = 1.3;

/**
 * What opens after the stamp: the asset's sound rises while its photos draw slowly nearer, with
 * three lines from its record; 24 seconds, the length of its capsule. Runs without a sound where
 * none could start. "Geç" and the sound's switch are there throughout (WCAG 1.4.2, 2.2.2).
 * With a screen reader it does not move on by itself: each line is read, and "Sonraki" goes on.
 * Leaving the app stops the sound (audio/capsule-player.ts); coming back starts the sequence again.
 */
export function SealSequence({ asset, muted = false, onDone }: { asset: AssetDetail; /** Starts with its sound off; the switch still brings it back. */ muted?: boolean; onDone: () => void }) {
  const lang = useLang();
  const w = useMessages().seal;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const screenReader = useScreenReaderStatus() === true;
  const { settings } = useA11ySettings();
  const { fontScale } = useWindowDimensions();
  const player = useCapsulePlayer();

  const soundKey = asset.ambientSound?.key;
  const type = soundKey ? capsuleForSoundKey(soundKey) : undefined;
  const scenes = useMemo(() => sealScenes(asset, lang), [asset, lang]);
  const photos = useMemo(() => scenePhotos(asset), [asset]);
  const seconds = useMemo(() => stepSeconds(scenes.length), [scenes.length]);
  const steps = useMemo(
    () => [{ id: "opening", head: asset.city.label.toLocaleUpperCase(lang), text: asset.name }, ...scenes, { id: "closing", head: asset.name, text: w.sequenceClosing }],
    [asset, lang, scenes, w],
  );

  const [step, setStep] = useState(0);
  // The clock starts with the sound, so the last line ends with it.
  const [began, setBegan] = useState(type === undefined);
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  }, [onDone]);

  const [away, setAway] = useState(false);
  // Set once this sequence has asked for its sound: until then the player may hold another capsule's state.
  const [asked, setAsked] = useState(false);

  // Asked for muted: only the first start is, so a sound the visitor brought back stays on after a return to the app.
  const startMuted = useRef(muted);
  useEffect(() => {
    if (away) return;
    if (type) {
      playCapsule(type);
      if (startMuted.current) setCapsuleMuted(true);
      startMuted.current = false;
    }
    setAsked(true);
    return stopCapsule;
  }, [type, away]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") setAway(false);
      else if (next === "background") {
        setAway(true);
        setAsked(false);
        setBegan(type === undefined);
        // With a screen reader the visitor sets the pace: their place is kept.
        if (!screenReader) setStep(0);
      }
    });
    return () => sub.remove();
  }, [type, screenReader]);

  const soundReady = asked && player !== null && !player.loading;
  useEffect(() => {
    if (soundReady) setBegan(true);
  }, [soundReady]);

  const last = step === steps.length - 1;
  const next = () => (last ? onDone() : setStep(step + 1));

  useEffect(() => {
    if (!began || screenReader || away) return;
    const timer = setTimeout(() => {
      if (step === steps.length - 1) finish.current();
      else setStep(step + 1);
    }, seconds[step]! * 1000);
    return () => clearTimeout(timer);
  }, [began, screenReader, away, step, steps.length, seconds]);

  const current = steps[step]!;
  useEffect(() => {
    announce(w.sceneSaid(current.head, current.text));
  }, [current, w]);

  const sounding = player?.audible === true;
  const longLine = current.text.length > LONG_LINE;
  const photo = photos.length > 0 ? photos[step % photos.length]! : null;
  const before = step > 0 && photos.length > 0 ? photos[(step - 1) % photos.length]! : null;
  const coming = photos.length > 1 && !last ? photos[(step + 1) % photos.length]! : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* Loaded ahead, unseen, so the next step does not open on a blurred preview. */}
        {coming && <AssetImage media={coming} fill decorative style={styles.ahead} />}
        {before && <Photo key={`${step - 1}`} media={before} seconds={0} still />}
        {photo && <Photo key={`${step}`} media={photo} seconds={seconds[step]!} still={reduceMotion} />}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="seal-sequence-veil" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={cameraColors.background} stopOpacity={0.55} />
              <Stop offset="0.35" stopColor={cameraColors.background} stopOpacity={0.25} />
              <Stop offset="0.65" stopColor={cameraColors.background} stopOpacity={0.9} />
              <Stop offset="1" stopColor={cameraColors.background} stopOpacity={0.98} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#seal-sequence-veil)" />
        </Svg>
        {(longLine || fontScale >= LARGE_TEXT) && <View style={[StyleSheet.absoluteFill, styles.darker]} />}
      </View>

      <View style={[styles.controls, { top: insets.top + spacing.sm }]}>
        {/* There from the moment the sound is asked for, not only once it is heard. */}
        {player && (player.audible || player.loading) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={player.muted ? w.unmute : w.mute}
            onPress={() => setCapsuleMuted(!player.muted)}
            style={styles.control}
          >
            <Ionicons name={player.muted ? "volume-mute" : "volume-high"} size={20} color={cameraColors.text} />
          </Pressable>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={w.skipSequence} onPress={onDone} style={[styles.control, styles.skip]}>
          <Text variant="label" colorValue={cameraColors.text}>
            {w.skipSequence}
          </Text>
        </Pressable>
      </View>

      {/* Scrolls when the system's large text does not fit; below the controls, so it never slides under them. */}
      <ScrollView style={[styles.fill, { marginTop: insets.top + spacing.sm + touchTarget.min }]} contentContainerStyle={[styles.words, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Line key={current.id} head={current.head} text={current.text} long={longLine} still={reduceMotion} />
        {sounding && settings.captions && type && player && (
          <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.caption}>
            {captionAt(type, player.elapsed, lang)}
          </Text>
        )}
        {screenReader && (
          <Pressable accessibilityRole="button" accessibilityLabel={last ? w.ok : w.nextScene} onPress={next} style={styles.next}>
            <Text variant="label" colorValue={cameraColors.onGold}>
              {last ? w.ok : w.nextScene}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

/** A photo fading in over the one before, drawing slowly nearer unless motion is reduced. */
function Photo({ media, seconds, still }: { media: Media; seconds: number; still: boolean }) {
  const fade = useRef(new Animated.Value(still ? 1 : 0)).current;
  const near = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The setting is read after the first render, when a fade may have begun.
    if (still) {
      fade.setValue(1);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(near, { toValue: 1, duration: seconds * 1000 + FADE_MS, easing: Easing.linear, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [still, seconds, fade, near]);

  const scale = near.interpolate({ inputRange: [0, 1], outputRange: [1, DRAW_NEAR] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ scale }] }]}>
      <AssetImage media={media} fill decorative />
    </Animated.View>
  );
}

/** A step's words, rising in. */
function Line({ head, text, long, still }: { head: string; text: string; long: boolean; still: boolean }) {
  const rise = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) {
      rise.setValue(1);
      return;
    }
    const animation = Animated.timing(rise, { toValue: 1, duration: FADE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [still, rise]);
  return (
    <Animated.View style={[styles.line, { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      <Text variant="overline" colorValue={cameraColors.gold}>
        {head}
      </Text>
      <Text variant={long ? "heading" : "title"} colorValue={cameraColors.text}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: cameraColors.background,
  },
  ahead: {
    opacity: 0,
  },
  fill: {
    flex: 1,
  },
  darker: {
    backgroundColor: cameraColors.background,
    opacity: 0.6,
  },
  controls: {
    position: "absolute",
    right: spacing.lg,
    zIndex: 2,
    flexDirection: "row",
    gap: spacing.sm,
  },
  control: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: cameraGlass,
  },
  skip: {
    paddingHorizontal: spacing.md,
  },
  words: {
    flexGrow: 1,
    justifyContent: "flex-end",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  line: {
    gap: spacing.sm,
  },
  caption: {
    fontFamily: fontFamily.mono,
  },
  next: {
    minHeight: touchTarget.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: cameraColors.gold,
  },
});
