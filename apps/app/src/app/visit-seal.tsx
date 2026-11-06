import { VISIT_RADIUS_METERS, type AssetDetail, type VisitResponse } from "@vagabonds/contracts";
import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { compileSource } from "@/ar/inscription-targets";
import { MarkerTracker } from "@/ar/marker-tracker";
import type { TrackerEvent } from "@/ar/mindar";
import type { TrackerTarget } from "@/ar/tracker-page";
import { AssetImage } from "@/components/asset-image";
import { BadgeArt } from "@/components/badge-art";
import { CameraTopBar } from "@/components/camera-chrome";
import { DataErrorView } from "@/components/resource-view";
import { communityAvailable, DataError, sendVisitProof, useAsset } from "@/data";
import { announce } from "@/lib/announce";
import { currentPosition, type Position } from "@/lib/current-position";
import { isAssetUnlocked } from "@/lib/related-assets";
import { unlockAsset, unlockForDemo, useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useScreenReaderStatus } from "@/lib/use-screen-reader";
import { visitSealTarget } from "@/lib/visit-seal";
import { localeTag, useLang, useMessages } from "@/i18n";

const DEFAULT_ASSET = "bursa-osmangazi-ulucami";
/** The target must stay in view this long before the visit is sealed, so a passing glimpse does not count. */
const HOLD_MS = 1000;
/** How long a seal that needs the position waits for a fix. */
const POSITION_WAIT_MS = 5000;
/** Where the stamp's one animated value stands as the seal hangs over the page, and as it strikes. */
const STAMP_HANGS = 0.6;
const STAMP_STRIKES = 0.8;

/** Compiled seal targets of this run, by asset and photo: compiling again takes seconds. */
const compiled = new Map<string, string>();

type Phase =
  | { name: "preparing"; progress: number }
  | { name: "starting" }
  | { name: "searching" }
  | { name: "holding" }
  | { name: "sending" }
  | { name: "sealed"; result: VisitResponse }
  | { name: "failed"; message: string };

/**
 * Ziyaret Mührü (module 1). On site, the visitor shows the camera a specific part of the monument
 * (its portal, inscription, mihrab…: `visitSealTarget`). Once the phone recognises it, the visit is sealed: proven with
 * the camera and the position (`POST /assets/:id/visit/proof`), which earns achievements.
 *
 * The photo is compiled into a MindAR target on the phone, so no target file is hosted per asset.
 * Without a camera (the web, ADR 0001; a screen reader on) the screen shows which part to find.
 */
export default function VisitSealScreen() {
  const lang = useLang();
  const m = useMessages();
  const w = m.seal;
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const resource = useAsset(id ?? DEFAULT_ASSET);
  const insets = useSafeAreaInsets();
  const screenReader = useScreenReaderStatus();
  const web = Platform.OS === "web";
  const asset = resource.status === "success" ? resource.data : null;
  const target = asset ? visitSealTarget(asset, lang) : null;
  const router = useRouter();
  const [unlocked, setUnlocked] = useState<VisitResponse | null | false>(false);
  // With a screen reader on the screen opens on the guide; the visitor may still ask for the camera.
  const [cameraAnyway, setCameraAnyway] = useState(false);
  // Sealed on this screen, the camera's own "sealed" step is still to show; only one unlocked before needs no seal.
  const [sealedHere, setSealedHere] = useState(false);
  const allUnlocked = useUnlockedAssets();
  const alreadyOpen = asset !== null && !sealedHere && isAssetUnlocked(asset, allUnlocked);
  // A try-out away from the sites: "Kilidi aç" records the visit, with its badges, as a sealed one would.
  const unlock = asset
    ? () => {
        void unlockForDemo(asset.id).then((result) => {
          announce(w.unlockedSaid(asset.name));
          setUnlocked(result);
        });
      }
    : undefined;

  let body;
  if (asset && unlocked !== false) {
    body = <Sealed asset={asset} result={unlocked ?? { verified: false, firstVisit: true, newAchievements: [] }} onDone={() => (router.canGoBack() ? router.back() : router.navigate("/map"))} />;
  } else if (alreadyOpen) {
    body = (
      <View style={styles.center}>
        <Text colorValue={cameraColors.text} style={styles.centerText}>
          {w.alreadyOpen}
        </Text>
      </View>
    );
  } else if (resource.status === "loading" || (!web && screenReader === null)) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={cameraColors.gold} size="large" accessibilityLabel={m.common.loading} />
      </View>
    );
  } else if (resource.status === "error") {
    body = (
      <View style={[styles.fill, { paddingTop: insets.top + 64 }]}>
        <DataErrorView error={resource.error} onRetry={resource.retry} />
      </View>
    );
  } else if (!asset || !target) {
    body = (
      <View style={styles.center}>
        <Text colorValue={cameraColors.text} style={styles.centerText}>
          {asset ? w.noPhoto : w.notFound}
        </Text>
        {unlock && <UnlockButton onPress={unlock} />}
      </View>
    );
  } else if (web || (screenReader && !cameraAnyway)) {
    body = (
      <>
        <SealGuide asset={asset} onUseCamera={web ? undefined : () => setCameraAnyway(true)} />
        {unlock && (
          <View style={[styles.unlockFloat, { bottom: insets.bottom + spacing.lg }]}>
            <UnlockButton onPress={unlock} />
          </View>
        )}
      </>
    );
  } else {
    body = <SealCamera asset={asset} onUnlock={unlock} onSealed={() => setSealedHere(true)} />;
  }

  return (
    <View style={styles.screen}>
      <Head>
        <title>{m.common.title(m.screens.visitSeal)}</title>
      </Head>
      {/* Before the content in the tree, so the title is read first (WCAG 1.3.2); drawn over it by zIndex. */}
      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title={m.screens.visitSeal} subtitle={asset?.name ?? w.site} />
      </View>
      {body}
    </View>
  );
}

/** Height of the floating "Kilidi aç" and its gap. */
const UNLOCK_ROOM = 44;

/** A small "Aç", just in case the camera does not recognise the photo: seals the visit at once (a demo simulation). */
function UnlockButton({ onPress }: { onPress: () => void }) {
  const w = useMessages().seal;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={w.unlock}
      // A demo simulation, and the screen reader must say so: it does not check the visit.
      accessibilityHint={w.unlockHint}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.unlock, pressed && { opacity: 0.7 }]}
    >
      <Text colorValue={cameraColors.text} style={styles.unlockText}>
        {w.unlockShort}
      </Text>
    </Pressable>
  );
}

/** Without a camera: the part to find, and how sealing works on site. */
function SealGuide({ asset, onUseCamera }: { asset: AssetDetail; onUseCamera?: () => void }) {
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const { photo, part } = visitSealTarget(asset, lang)!;
  const w = useMessages().seal;
  return (
    // Room at the end for the floating "Kilidi aç", so the last button is not under it.
    <ScrollView contentContainerStyle={[styles.guide, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + spacing.xl + UNLOCK_ROOM }]}>
      <Text variant="overline" colorValue={cameraColors.gold}>
        {w.partHead(part.toLocaleUpperCase(lang))}
      </Text>
      <View style={styles.guidePhoto}>
        <AssetImage media={photo} />
      </View>
      <Text variant="heading" colorValue={cameraColors.text}>
        {w.findPart(part.toLocaleLowerCase(lang))}
      </Text>
      <Text colorValue={cameraColors.textSecondary}>
        {w.how(VISIT_RADIUS_METERS)}
      </Text>
      {/* A screen reader opens the guide; the seal still needs the camera, which then talks the visitor through it. */}
      {onUseCamera && (
        <Button
          label={w.openCamera}
          accessibilityHint={w.openCameraHint(part.toLocaleLowerCase(lang))}
          onPress={onUseCamera}
          colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]}
        />
      )}
    </ScrollView>
  );
}

function SealCamera({ asset, onUnlock, onSealed }: { asset: AssetDetail; onUnlock?: () => void; onSealed: () => void }) {
  const lang = useLang();
  const w = useMessages().seal;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { photo, part } = visitSealTarget(asset, lang)!;
  const key = `${asset.id}:${photo.key}`;
  const [run, setRun] = useState(0);
  const [phase, setPhaseState] = useState<Phase>(compiled.has(key) ? { name: "starting" } : { name: "preparing", progress: 0 });
  // Read inside tracker events and timers, which arrive outside React's render.
  const phaseRef = useRef(phase);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hold = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  // The cached .mind file once compiled; the photo before. Fixed per run, so the page is not rebuilt.
  const target = useMemo<TrackerTarget>(() => {
    const mind = compiled.get(key);
    return mind ? { mind } : { image: compileSource(photo) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, run]);

  const seal = useCallback(async () => {
    go({ name: "sending" });
    if (!communityAvailable) return go({ name: "failed", message: w.needsServer });
    const prove = (position: Position | null) => sendVisitProof(asset.id, { mediaKey: photo.key, ...(position ?? {}) });
    try {
      // The API alone decides whether the position is needed: with DEMO_UNLOCK a printed photo seals from anywhere,
      // without waiting on a slow fix or a permission dialog in front of an audience.
      const result = await prove(null).catch(async (error: unknown) => {
        if (!(error instanceof DataError) || error.code !== "POSITION_REQUIRED") throw error;
        // A slow fix indoors must not hold up the seal forever; the API says if it came too late.
        return prove(
          await Promise.race([
            currentPosition(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), POSITION_WAIT_MS)),
          ]),
        );
      });
      onSealed();
      unlockAsset(asset.id);
      go({ name: "sealed", result });
      announce(w.sealedSaid(result.newAchievements.length));
    } catch (error) {
      go({ name: "failed", message: error instanceof DataError ? error.message : w.failed });
    }
  }, [asset.id, photo.key, go, onSealed, w]);

  const onEvent = useCallback(
    (event: TrackerEvent) => {
      const now = phaseRef.current.name;
      switch (event.type) {
        case "compile":
          go({ name: "preparing", progress: event.progress });
          break;
        case "compiled":
          compiled.set(key, event.mind);
          go({ name: "starting" });
          break;
        case "ready":
          if (now === "preparing" || now === "starting") {
            go({ name: "searching" });
            // Guidance for a visitor who cannot see the image; nothing is said without a screen reader.
            announce(w.cameraOpenSaid(part));
          }
          break;
        case "found":
          if (now !== "searching") break;
          go({ name: "holding" });
          announce(w.recognisedSaid);
          hold.setValue(0);
          if (!reduceMotion) Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start();
          holdTimer.current = setTimeout(() => void seal(), HOLD_MS);
          break;
        case "lost":
          if (now === "holding") {
            clearTimeout(holdTimer.current);
            hold.stopAnimation();
            go({ name: "searching" });
          }
          break;
        case "error":
          go({ name: "failed", message: w.tracker[event.reason] });
          break;
      }
    },
    [go, key, hold, reduceMotion, seal, part, w],
  );

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const retry = () => {
    clearTimeout(holdTimer.current);
    go(compiled.has(key) ? { name: "starting" } : { name: "preparing", progress: 0 });
    setRun((n) => n + 1);
  };

  if (phase.name === "sealed") return <Sealed asset={asset} result={phase.result} onDone={() => (router.canGoBack() ? router.back() : router.navigate("/camera"))} />;

  return (
    <View style={styles.fill}>
      <MarkerTracker key={run} target={target} onEvent={onEvent} style={StyleSheet.absoluteFill} />

      <View style={[styles.hint, { top: insets.top + 72 }]} accessible accessibilityLabel={w.findLabel(part, photo.alt)}>
        <View style={styles.hintPhoto}>
          <AssetImage media={photo} fill decorative />
        </View>
        <Text variant="caption" colorValue={cameraColors.gold} style={styles.mono} numberOfLines={1}>
          {part.toLocaleUpperCase(lang)}
        </Text>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityLiveRegion="polite">
        {onUnlock && <UnlockButton onPress={onUnlock} />}
        <PanelBody phase={phase} hold={hold} onRetry={retry} />
      </View>
    </View>
  );
}

function PanelBody({
  phase,
  hold,
  onRetry,
}: {
  phase: Phase;
  hold: Animated.Value;
  onRetry: () => void;
}) {
  const m = useMessages();
  const w = m.seal;
  switch (phase.name) {
    case "preparing":
      return (
        <>
          <Text variant="heading" colorValue={cameraColors.text}>
            {w.preparing}
          </Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${Math.round(phase.progress * 100)}%` }]} />
          </View>
          <Text variant="caption" colorValue={cameraColors.textSecondary}>
            {w.preparingHint}
          </Text>
        </>
      );
    case "starting":
    case "sending":
      return (
        <View style={styles.row}>
          <ActivityIndicator color={cameraColors.gold} />
          <Text variant="label" colorValue={cameraColors.text}>
            {phase.name === "starting" ? w.cameraOpening : w.sealing}
          </Text>
        </View>
      );
    case "searching":
      return (
        <>
          <Text variant="heading" colorValue={cameraColors.text}>
            {w.frameIt}
          </Text>
          <Text colorValue={cameraColors.textSecondary}>{w.frameHint}</Text>
        </>
      );
    case "holding":
      return (
        <>
          <Text variant="heading" colorValue={cameraColors.gold}>
            {w.holdStill}
          </Text>
          <View style={styles.track}>
            <Animated.View style={[styles.bar, { width: hold.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
          </View>
        </>
      );
    case "failed":
      return (
        <>
          <Text colorValue={cameraColors.text} accessibilityRole="alert">
            {phase.message}
          </Text>
          <Button label={m.common.retry} onPress={onRetry} colors={[cameraColors.gold, cameraColors.onGold]} />
        </>
      );
    case "sealed":
      return null;
  }
}

/**
 * The seal comes down like a stamp: it sinks in large and empty, hangs for a beat, and strikes. The ink
 * shows at the strike, a ring spreads from it and the page jolts; then what the visit earned.
 */
function Sealed({ asset, result, onDone }: { asset: AssetDetail; result: Pick<VisitResponse, "verified" | "firstVisit" | "newAchievements">; onDone: () => void }) {
  const lang = useLang();
  const w = useMessages().seal;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const stamp = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const strike = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const reveal = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      stamp.setValue(1);
      strike.setValue(1);
      reveal.setValue(1);
      return;
    }
    const animation = Animated.sequence([
      Animated.timing(stamp, { toValue: STAMP_HANGS, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(170),
      Animated.timing(stamp, { toValue: STAMP_STRIKES, duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(stamp, { toValue: 1, damping: 10, stiffness: 180, mass: 0.7, useNativeDriver: true }),
        Animated.timing(strike, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(reveal, { toValue: 1, duration: 520, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, stamp, strike, reveal]);

  const scale = stamp.interpolate({ inputRange: [0, STAMP_HANGS, STAMP_STRIKES, 1], outputRange: [2.4, 1.26, 0.92, 1] });
  const rotate = stamp.interpolate({ inputRange: [0, STAMP_HANGS, 1], outputRange: ["-22deg", "-8deg", "-8deg"] });
  const opacity = stamp.interpolate({ inputRange: [0, STAMP_HANGS * 0.6, 1], outputRange: [0, 1, 1] });
  const ink = stamp.interpolate({ inputRange: [0, STAMP_STRIKES - 0.02, STAMP_STRIKES, 1], outputRange: [0, 0, 1, 1] });
  const jolt = strike.interpolate({ inputRange: [0, 0.06, 0.14, 0.24, 0.36, 1], outputRange: [0, 5, -3, 2, -1, 0] });
  const date = new Date().toLocaleDateString(localeTag(lang), { day: "numeric", month: "long", year: "numeric" });

  return (
    <ScrollView contentContainerStyle={[styles.sealed, { paddingTop: insets.top + 96, paddingBottom: insets.bottom + spacing.xl }]}>
      <Animated.View style={[styles.sealStage, { transform: [{ translateY: jolt }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View
          style={[
            styles.sealRing,
            {
              opacity: strike.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: strike.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.6] }) }],
            },
          ]}
        />
        <Animated.View style={[styles.seal, { opacity, transform: [{ scale }, { rotate }] }]}>
          <View style={styles.sealInner}>
            <Animated.View style={[styles.sealInk, { opacity: ink }]}>
              <Text style={styles.sealCaption} colorValue={cameraColors.gold}>
                {w.stamp}
              </Text>
              <Text variant="heading" colorValue={cameraColors.text} style={styles.centerText} numberOfLines={2}>
                {asset.name}
              </Text>
              <Text style={styles.sealCaption} colorValue={cameraColors.textSecondary}>
                {date.toLocaleUpperCase(lang)}
              </Text>
            </Animated.View>
          </View>
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.sealedText, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
        <Text variant="title" colorValue={cameraColors.text} style={styles.centerText} headingLevel={2}>
          {w.sealedTitle}
        </Text>
        <Text colorValue={cameraColors.textSecondary} style={styles.centerText}>
          {result.verified ? w.verified : ""}
          {result.firstVisit ? w.firstVisit : w.againVisit}
        </Text>

        {result.newAchievements.length > 0 && (
          <View style={styles.badges}>
            <Text variant="overline" colorValue={cameraColors.gold}>
              {w.newBadges}
            </Text>
            {result.newAchievements.map((achievement) => (
              <View key={achievement.code} style={styles.badge} accessible accessibilityLabel={w.badgeLabel(achievement.title, achievement.points, achievement.description)}>
                <BadgeArt code={achievement.code} emoji={achievement.badge} imageUrl={achievement.imageUrl} size={48} />
                <View style={styles.flex}>
                  <Text variant="label" colorValue={cameraColors.text}>
                    {achievement.title}
                  </Text>
                  <Text variant="caption" colorValue={cameraColors.textSecondary}>
                    {achievement.description}
                  </Text>
                </View>
                <Text variant="label" colorValue={cameraColors.gold}>
                  +{achievement.points}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Button label={w.ok} onPress={onDone} colors={[cameraColors.gold, cameraColors.onGold]} style={styles.done} />
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: cameraColors.background,
  },
  fill: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  unlock: {
    alignSelf: "flex-end",
    minHeight: 28,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: cameraColors.background,
  },
  unlockText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 12,
  },
  unlockFloat: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    padding: spacing.xl,
  },
  centerText: {
    textAlign: "center",
  },
  top: {
    position: "absolute",
    zIndex: 2,
    elevation: 2,
    left: spacing.lg,
    right: spacing.lg,
  },
  mono: {
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1.5,
  },
  hint: {
    position: "absolute",
    right: spacing.lg,
    width: 112,
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: cameraGlass,
    alignItems: "center",
  },
  hintPhoto: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: cameraColors.gold,
  },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: cameraGlass,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  bar: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: cameraColors.gold,
  },
  guide: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  guidePhoto: {
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: cameraColors.gold,
  },
  sealed: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  sealStage: {
    width: 220,
    height: 220,
    marginBottom: spacing.lg,
  },
  sealRing: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: cameraColors.gold,
  },
  sealedText: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.md,
  },
  seal: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: cameraColors.gold,
    padding: 8,
  },
  sealInk: {
    alignItems: "center",
    gap: spacing.xs,
  },
  sealInner: {
    flex: 1,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: cameraColors.gold,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.lg,
  },
  sealCaption: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2,
  },
  badges: {
    alignSelf: "stretch",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: cameraColors.panel,
  },
  done: {
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
});
