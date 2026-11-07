import Ionicons from "@expo/vector-icons/Ionicons";
import { VISIT_RADIUS_METERS, type AssetDetail, type VisitResponse } from "@vagabonds/contracts";
import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { compileSource } from "@/ar/inscription-targets";
import { MarkerTracker } from "@/ar/marker-tracker";
import type { TrackerEvent } from "@/ar/mindar";
import type { TrackerTarget } from "@/ar/tracker-page";
import { AssetImage } from "@/components/asset-image";
import { BadgeArt } from "@/components/badge-art";
import { CameraTopBar } from "@/components/camera-chrome";
import { DataErrorView } from "@/components/resource-view";
import { SealSequence } from "@/components/seal-sequence";
import { SealStamp } from "@/components/seal-stamp";
import { capsuleForSoundKey } from "@/content/capsules";
import { communityAvailable, DataError, sendVisitProof, useAsset } from "@/data";
import { holdBadges } from "@/data/new-badges";
import { announce } from "@/lib/announce";
import { currentPosition, type Position } from "@/lib/current-position";
import { isAssetUnlocked } from "@/lib/related-assets";
import { unlockAsset, unlockForDemo, useUnlockedAssets } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useScreenReaderStatus } from "@/lib/use-screen-reader";
import { visitSealTarget } from "@/lib/visit-seal";
import { localeTag, useLang, useMessages } from "@/i18n";

const DEFAULT_ASSET = "bursa-osmangazi-ulucami";
/** How much of the monument's photo shows over the camera: as much as lines up with it, the camera still seen through. */
const GHOST = 0.4;
/** Once recognised the gold corners take over; the photo steps back. */
const GHOST_RECOGNISED = 0.15;
/** The target must stay in view this long before the visit is sealed, so a passing glimpse does not count. */
const HOLD_MS = 1000;
/** How long a seal that needs the position waits for a fix. */
const POSITION_WAIT_MS = 5000;
/** Room left for the top bar over the sealed screen. */
const TOP_BAR_ROOM = 72;
/** The sequence's window is closing for this long: iOS refuses to open another (the badges) meanwhile. */
const WINDOW_CLOSES_MS = 500;

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
  // The badges wait for the seal's own moment: a sealed visit's answer would open them over the stamp.
  const [settled, setSettled] = useState(false);
  const onSettled = useCallback(() => setSettled(true), []);
  useEffect(() => (settled ? undefined : holdBadges()), [settled]);
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
    body = <Sealed asset={asset} result={unlocked ?? { verified: false, firstVisit: true, newAchievements: [] }} onSettled={onSettled} onDone={() => (router.canGoBack() ? router.back() : router.navigate("/map"))} />;
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
    body = <SealCamera asset={asset} onUnlock={unlock} onSealed={() => setSealedHere(true)} onSettled={onSettled} />;
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
const UNLOCK_ROOM = 72;

/** "Kilidi aç", for testing: seals the visit at once, standing in for recognising the part (a demo simulation). */
function UnlockButton({ onPress }: { onPress: () => void }) {
  const w = useMessages().seal;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={w.unlock}
      // A demo simulation, and the screen reader must say so: it does not check the visit.
      accessibilityHint={w.unlockHint}
      onPress={onPress}
      style={({ pressed }) => [styles.unlock, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      <Ionicons name="lock-open" size={18} color={cameraColors.onGold} />
      <Text variant="label" colorValue={cameraColors.onGold} style={styles.unlockText}>
        {w.unlock}
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

function SealCamera({ asset, onUnlock, onSealed, onSettled }: { asset: AssetDetail; onUnlock?: () => void; onSealed: () => void; onSettled: () => void }) {
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

  if (phase.name === "sealed") return <Sealed asset={asset} result={phase.result} onSettled={onSettled} onDone={() => (router.canGoBack() ? router.back() : router.navigate("/camera"))} />;

  return (
    <View style={styles.fill}>
      <MarkerTracker key={run} target={target} onEvent={onEvent} style={StyleSheet.absoluteFill} />

      {/* Over the camera as a ghost, for the visitor to line up with the monument; the tracker sees only the camera. */}
      <View
        style={[StyleSheet.absoluteFill, { opacity: phase.name === "holding" || phase.name === "sending" ? GHOST_RECOGNISED : GHOST }]}
        pointerEvents="none"
        accessible
        accessibilityLabel={w.findLabel(part, photo.alt)}
      >
        <AssetImage media={photo} fill decorative />
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityLiveRegion="polite">
        {onUnlock && <UnlockButton onPress={onUnlock} />}
        <PanelBody phase={phase} part={part} hold={hold} onRetry={retry} />
      </View>
    </View>
  );
}

function PanelBody({
  phase,
  part,
  hold,
  onRetry,
}: {
  phase: Phase;
  part: string;
  hold: Animated.Value;
  onRetry: () => void;
}) {
  const lang = useLang();
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
          <Text variant="caption" colorValue={cameraColors.gold} style={styles.mono}>
            {part.toLocaleUpperCase(lang)}
          </Text>
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
 * The seal is stamped (`SealStamp`): one red seal comes down, strikes and its ink soaks into the page. A first
 * visit then offers its sequence with one tap (a tap, as many seals are struck inside a mosque or a tomb,
 * where a sound must not start by itself); then what the visit earned.
 */
function Sealed({ asset, result, onDone, onSettled }: { asset: AssetDetail; result: Pick<VisitResponse, "verified" | "firstVisit" | "newAchievements">; onDone: () => void; onSettled: () => void }) {
  const lang = useLang();
  const m = useMessages();
  const w = m.seal;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const [stage, setStage] = useState<"offer" | "sequence" | "result">(result.firstVisit ? "offer" : "result");
  // Watched without its sound: the sequence starts muted, its switch still there.
  const [muted, setMuted] = useState(false);
  const hasSound = capsuleForSoundKey(asset.ambientSound?.key ?? "") !== undefined;
  const watch = (withSound: boolean) => {
    setMuted(!withSound);
    setStage("sequence");
  };

  const windowOpened = useRef(false);
  useEffect(() => {
    if (stage === "sequence") windowOpened.current = true;
    if (stage !== "result") return;
    const settle = setTimeout(onSettled, windowOpened.current ? WINDOW_CLOSES_MS : 0);
    return () => clearTimeout(settle);
  }, [stage, onSettled]);

  const date = new Date().toLocaleDateString(localeTag(lang), { day: "numeric", month: "long", year: "numeric" });

  return (
    // Set in the middle of the screen, under the top bar: the seal and what it says read as one.
    <ScrollView contentContainerStyle={[styles.sealed, { paddingTop: insets.top + TOP_BAR_ROOM, paddingBottom: insets.bottom + spacing.xl }]}>
      <SealStamp name={asset.name} ring={`${w.stamp} • ${m.profile.issuer.toLocaleUpperCase(lang)}`} date={date.toLocaleUpperCase(lang)} reduceMotion={reduceMotion} reveal={reveal} />

      <Animated.View style={[styles.sealedText, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
        <Text variant="title" colorValue={cameraColors.text} style={styles.centerText} headingLevel={2}>
          {w.sealedTitle}
        </Text>
        <Text colorValue={cameraColors.textSecondary} style={styles.centerText}>
          {result.verified ? w.verified : ""}
          {result.firstVisit ? w.firstVisit : w.againVisit}
        </Text>

        {stage !== "result" && hasSound && (
          <View style={styles.offer}>
            {/* Says there is a sound before the choice; the buttons say it again for a screen reader. */}
            <View style={styles.soundCue} aria-hidden>
              <Ionicons name="musical-notes" size={15} color={cameraColors.gold} />
              <Text variant="caption" colorValue={cameraColors.gold} style={styles.soundCueText}>
                {w.soundHere}
              </Text>
            </View>
            <View style={styles.watchRow}>
              <Button
                label={w.watchWithSound}
                accessibilityHint={w.watchWithSoundHint}
                icon={<Ionicons name="volume-high" size={20} color={cameraColors.onGold} />}
                onPress={() => watch(true)}
                colors={[cameraColors.gold, cameraColors.onGold]}
                style={styles.watch}
              />
              <Button
                label={w.watchMuted}
                accessibilityHint={w.watchMutedHint}
                icon={<Ionicons name="volume-mute" size={20} color={cameraColors.text} />}
                onPress={() => watch(false)}
                colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.22)"]}
                style={styles.watch}
              />
            </View>
          </View>
        )}
        {/* No sound to choose about: the sequence runs on its words, and can be left out. */}
        {stage !== "result" && !hasSound && (
          <>
            <Button label={w.openTime} accessibilityHint={w.openTimeHint} onPress={() => watch(true)} colors={[cameraColors.gold, cameraColors.onGold]} style={styles.done} />
            <Button
              label={w.skipTime}
              accessibilityHint={w.skipTimeHint}
              onPress={() => setStage("result")}
              colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]}
              style={styles.skip}
            />
          </>
        )}

        {stage === "result" && result.newAchievements.length > 0 && (
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

        {stage === "result" && <Button label={w.ok} onPress={onDone} colors={[cameraColors.gold, cameraColors.onGold]} style={styles.done} />}
      </Animated.View>

      {/* Over the screen's top bar too; the system's back gesture ends it as "Geç" does. */}
      <Modal visible={stage === "sequence"} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setStage("result")}>
        {stage === "sequence" && <SealSequence asset={asset} muted={muted} onDone={() => setStage("result")} />}
      </Modal>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.full,
    backgroundColor: "#FFFFFF",
  },
  unlockText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 17,
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
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  sealedText: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.md,
  },
  offer: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  soundCue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  soundCueText: {
    fontFamily: fontFamily.sansSemiBold,
    letterSpacing: 0.3,
  },
  watchRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  watch: {
    flexGrow: 1,
    flexBasis: 150,
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
  skip: {
    alignSelf: "stretch",
  },
});
