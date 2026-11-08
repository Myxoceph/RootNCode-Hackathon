import { Button, cameraColors, cameraGlass, fontFamily, palette, radius, spacing, Text } from "@vagabonds/ui";
import { File, Paths } from "expo-file-system";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AssetDetail } from "@vagabonds/contracts";

import { useInscriptionScope } from "@/ar/inscription-scope";
import { isTrackable, rememberCompiledSet, useTargetSet, type TrackedTarget } from "@/ar/inscription-targets";
import { MarkerTracker, type MarkerTrackerHandle } from "@/ar/marker-tracker";
import type { TrackerEvent, TrackerFailure } from "@/ar/mindar";
import { inscriptionOf, inscriptionPlace, inscriptionText, isInscriptionReading, readAloudKey, type InscriptionText } from "@/ar/use-inscription";
import { AskPanel } from "@/components/ask-panel";
import { CameraTopBar, GlassIconButton, GlassPill } from "@/components/camera-chrome";
import { GlassFill } from "@/components/city-asset-cards";
import { InscriptionReading } from "@/components/inscription-reading";
import { DataError, type ResourceWithRetry } from "@/data";
import { useInscriptionVolunteers } from "@/data/inscription-proposals";
import { useLang, useMessages, type Messages } from "@/i18n";
import { announce } from "@/lib/announce";
import { cue } from "@/lib/feedback";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { speakAnswer, stopAnswer, stopAnswerOf, useSpeaking } from "@/lib/voice";
import { useScreenReaderStatus } from "@/lib/use-screen-reader";
import { useA11ySettings } from "@/settings/a11y-settings";

type Phase = "preparing" | "starting" | "scanning" | "locked" | "revealed";

/** How long the gold corners hold on the inscription before its card rises. */
const REVEAL_MS = 800;

/**
 * Taşın Dili (module 2). The camera looks for inscriptions with MindAR (ADR 0002): those of
 * the asset it was opened from, else those of the assets near the visitor. Each is the
 * dataset's photo of it (`arTargetMediaKey`), as its `.mind` file or compiled on the phone.
 * Once one is found its translation lies over the stone and moves with it, and its reading,
 * today's Turkish and the waqf rise in a card below, from the asset's record. Nothing is
 * read off the stone: the text is the dataset's, checked against its sources.
 *
 * The camera-free reading mode (K7) opens instead on the web (no camera,
 * ADR 0001), when a screen reader is on and when the camera cannot start; on a
 * phone it is one tap away.
 */
export default function InscriptionScreen() {
  const lang = useLang();
  const m = useMessages();
  const w = m.reading;
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const insets = useSafeAreaInsets();
  const web = Platform.OS === "web";
  const screenReader = useScreenReaderStatus();
  const [chosen, setMode] = useState<"camera" | "reading" | null>(web ? "reading" : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The location only serves the camera: not asked for on the web or with a screen reader;
  // `null` waits until the system says whether one is on.
  const locate = web ? false : screenReader === null ? null : !screenReader;
  const scope = useInscriptionScope(id, locate, attempt);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // The asset the reading mode shows: the one asked for, or the nearest.
  const asset: ResourceWithRetry<AssetDetail | null> =
    scope.status === "loading"
      ? { status: "loading", retry }
      : scope.status === "error"
        ? { status: "error", error: new DataError("unavailable", m.errors.noData, []), retry }
        : { status: "success", data: scope.assets[0] ?? null, retry };
  const loaded = scope.status !== "loading";
  const router = useRouter();
  // The asset the assistant's answer is grounded in: the one asked for, or the nearest. Not the
  // sample asset opened when nothing near is known: an answer from the wrong record is worse than
  // none, so then it answers from the photo alone.
  const askAsset = id ?? (scope.status === "ready" && scope.nearby ? (scope.assets[0]?.id ?? null) : null);
  // Opened from the camera tab, and nothing near the visitor: the camera still knows the sample
  // inscriptions, but the reading does not show the sample asset as if it were here.
  const sampleOnly = id === undefined && scope.status === "ready" && !scope.nearby;
  const askAbout = (asset: string | null) => {
    const name = scope.status === "ready" ? scope.assets.find((a) => a.id === asset)?.name : undefined;
    router.push({ pathname: "/stone-ask", params: asset ? { asset, ...(name && { name }) } : {} });
  };
  // No inscription with a photo to find (or nothing loaded): the camera has nothing to look for.
  const trackable = scope.status === "ready" ? scope.assets.filter(isTrackable) : [];
  const untrackable = loaded && trackable.length === 0;
  // Until the assets are in and the system says whether a screen reader is on, open neither,
  // so the camera is not asked for in vain; the camera never opens with nothing to look for.
  const mode = !loaded
    ? chosen === "reading"
      ? "reading"
      : null
    : untrackable
      ? "reading"
      : (chosen ?? (screenReader === null ? null : screenReader ? "reading" : "camera"));

  // A screen reader cannot follow a camera image; start such users on the text.
  useEffect(() => {
    if (screenReader) setMode("reading");
  }, [screenReader]);

  // Another screen over this one (the assistant, Taşa Sor): the camera's WebView loses its video
  // there and does not get it back, so the camera closes and starts afresh on the way back.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onFailure = useCallback((reason: TrackerFailure) => {
    setNotice(`${m.seal.tracker[reason]} ${w.readBelow}`);
    setMode("reading");
  }, [m, w]);

  return (
    <>
      <Head>
        <title>{m.common.title(m.screens.inscription)}</title>
      </Head>
      {mode === "reading" && (
        <InscriptionReading
          empty={sampleOnly ? { message: w.noneNearby, onRetry: retry } : null}
          inscription={inscriptionOf(asset, null, lang)}
          notice={untrackable && asset.status === "success" ? w.noTarget : notice}
          onAsk={web ? null : () => askAbout(askAsset)}
          onUseCamera={
            web || untrackable
              ? null
              : () => {
                  setNotice(null);
                  setMode("camera");
                }
          }
        />
      )}
      {mode === "camera" && trackable.length > 0 && focused && (
        <InscriptionCamera
          assets={trackable}
          nearby={scope.status === "ready" && scope.nearby}
          asked={id !== undefined}
          askAsset={askAsset}
          onFailure={onFailure}
          onReadAsText={askAsset ? () => setMode("reading") : null}
        />
      )}
      {mode === null && (
        <View style={[styles.screen, styles.waiting]}>
          <ActivityIndicator color={cameraColors.gold} size="large" accessibilityLabel={m.common.loading} />
          <View style={[styles.top, { top: insets.top + spacing.sm }]}>
            <CameraTopBar title={m.screens.inscription} subtitle={m.common.loading} />
          </View>
        </View>
      )}
    </>
  );
}

/** Scanning this long without an inscription in view offers the assistant. */
const ASK_AFTER_MS = 10_000;
/** The tracker page answers a snapshot within this, or the photo counts as not taken. */
const SNAPSHOT_TIMEOUT_MS = 5_000;

interface InscriptionCameraProps {
  /** The assets whose inscriptions are looked for; each has at least one. */
  assets: AssetDetail[];
  /** They are the ones near the visitor. */
  nearby: boolean;
  /** Opened from an asset's page. */
  asked: boolean;
  /** The asset a question to the assistant is about, or null when it is not known (the photo alone). */
  askAsset: string | null;
  onFailure: (reason: TrackerFailure) => void;
  /** The camera-free reading, of the asset asked for or the nearest; null near none (it would show a sample). */
  onReadAsText: (() => void) | null;
}

/**
 * What the bar under the title says is being looked for: the tracked targets (capped at
 * `MAX_TARGETS`), counted by the assets they are on. Near no asset, the sample inscriptions the
 * camera still knows are not named: only how to aim.
 */
function lookingFor(assets: AssetDetail[], targets: TrackedTarget[], nearby: boolean, asked: boolean, w: Messages["reading"]): string {
  if (!nearby && !asked) return w.focus;
  const on = assets.filter((asset) => targets.some((t) => t.assetId === asset.id));
  const single = on.length === 1 ? w.oneOf(on[0]!.name, targets.length) : null;
  const many = w.many(on.length, targets.length, asked);
  return nearby ? w.nearby(single ?? many) : (single ?? many);
}

function InscriptionCamera({ assets, nearby, asked, askAsset, onFailure, onReadAsText }: InscriptionCameraProps) {
  const lang = useLang();
  const m = useMessages();
  const router = useRouter();
  const volunteers = useInscriptionVolunteers();
  const w = m.reading;
  const insets = useSafeAreaInsets();
  const set = useTargetSet(assets);
  const overlays = useMemo(() => set?.targets.map((t) => t.overlay), [set]);
  const [tracked, setTracked] = useState<TrackedTarget | null>(null);
  const trackedAsset = assets.find((a) => a.id === tracked?.assetId) ?? assets[0]!;
  const text = inscriptionText(trackedAsset, tracked?.inscriptionId ?? "", lang);
  const noRetry = useCallback(() => {}, []);
  const inscription: ResourceWithRetry<InscriptionText> = text
    ? { status: "success", data: text, retry: noRetry }
    : inscriptionOf({ status: "success", data: trackedAsset, retry: noRetry }, null, lang);
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("starting");
  const [progress, setProgress] = useState(0);
  const [height, setHeight] = useState(0);
  // The card opens small, so the translation on the stone stays in view; "Devamı" opens the rest.
  const [expanded, setExpanded] = useState(false);
  const scan = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const revealTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Read inside tracker events, which arrive outside React's render.
  const phaseRef = useRef<Phase>("starting");
  // The target in view, or -1, so "Yeniden tara" can lock again without a new `found`.
  const inView = useRef(-1);
  const tracker = useRef<MarkerTrackerHandle>(null);
  // No inscription found for a while: the assistant is offered for whatever the camera shows.
  const [offered, setOffered] = useState(false);
  const [asking, setAskingState] = useState(false);
  const askingRef = useRef(false);
  const setAsking = useCallback((next: boolean) => {
    askingRef.current = next;
    setAskingState(next);
  }, []);
  // The one snapshot asked for: a reply after its time is up resolves nothing.
  const snapshot = useRef<{ resolve: (jpeg: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  // The tracker's frame stands still (a snapshot was taken): `resume` forgets what it showed and
  // posts `found` afresh, so what was in view before is not known any more.
  const frozen = useRef(false);
  // Counts the scans after asking: each one offers the assistant again after its own wait.
  const [scanRound, setScanRound] = useState(0);

  useEffect(() => {
    if (phase !== "scanning") return;
    const timer = setTimeout(() => setOffered(true), ASK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [phase, scanRound]);

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const reveal = useCallback(() => {
    go("revealed");
    announce(w.solvedSaid);
  }, [go, w]);

  // The card rises once it is on screen: a native animation started before its view exists can skip.
  useEffect(() => {
    if (phase !== "revealed") return;
    if (reduceMotion) {
      card.setValue(1);
      return;
    }
    card.setValue(0);
    const rise = Animated.timing(card, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    rise.start();
    return () => rise.stop();
  }, [card, phase, reduceMotion]);

  const lock = useCallback(
    (index: number) => {
      setTracked(set?.targets[index] ?? null);
      clearTimeout(revealTimer.current);
      if (reduceMotion) {
        cue("inscriptionFound");
        reveal();
        return;
      }
      go("locked");
      announce(w.foundSaid);
      cue("inscriptionFound");
      revealTimer.current = setTimeout(reveal, REVEAL_MS);
    },
    [go, set, reduceMotion, reveal, w],
  );

  const onEvent = useCallback(
    (event: TrackerEvent) => {
      switch (event.type) {
        case "compile":
          if (phaseRef.current === "starting" || phaseRef.current === "preparing") go("preparing");
          setProgress(event.progress);
          break;
        case "compiled":
          if (set) rememberCompiledSet(set.key, event.mind);
          go("starting");
          break;
        case "ready":
          if (phaseRef.current === "starting" || phaseRef.current === "preparing") go("scanning");
          break;
        case "found":
          inView.current = event.target;
          // While asking, the camera stays on what the visitor asks about.
          if (phaseRef.current === "scanning" && !askingRef.current) lock(event.target);
          break;
        case "snapshot": {
          const pending = snapshot.current;
          if (!pending) break;
          snapshot.current = null;
          clearTimeout(pending.timer);
          if (event.jpeg) pending.resolve(event.jpeg);
          else pending.reject(new Error(event.error ?? "no frame"));
          break;
        }
        case "lost":
          if (inView.current === event.target) inView.current = -1;
          // Once the card is up it stays, so reading it does not depend on holding the phone still.
          if (phaseRef.current === "locked") {
            clearTimeout(revealTimer.current);
            go("scanning");
          }
          break;
        case "error":
          onFailure(event.reason);
          break;
      }
    },
    [go, lock, onFailure, set],
  );

  // The frame in view, frozen, as a JPEG file for the assistant.
  const takePhoto = async (): Promise<string> => {
    if (snapshot.current) throw new Error("a snapshot is already on its way");
    const jpeg = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (snapshot.current?.timer === timer) snapshot.current = null;
        reject(new Error("no frame in time"));
      }, SNAPSHOT_TIMEOUT_MS);
      snapshot.current = { resolve, reject, timer };
      frozen.current = true;
      tracker.current?.send("snapshot");
    });
    const binary = atob(jpeg);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    // One file, written over by each question: the photos are not kept.
    const file = new File(Paths.cache, "inscription-ask.jpg");
    file.create({ overwrite: true });
    await file.write(bytes);
    return file.uri;
  };

  const ask = () => {
    clearTimeout(revealTimer.current);
    setAsking(true);
  };

  // The camera runs on. After a snapshot the tracker posts `found` again for what it sees.
  const resumeCamera = () => {
    if (frozen.current) {
      frozen.current = false;
      inView.current = -1;
    }
    tracker.current?.send("resume");
  };

  const stopAsking = () => {
    resumeCamera();
    setAsking(false);
    go("scanning");
    setOffered(false);
    setScanRound((n) => n + 1);
    // An inscription found while asking (the camera never stood still) stays in view without a
    // new `found`: its card rises now.
    if (inView.current >= 0) lock(inView.current);
  };

  const rescan = () => {
    clearTimeout(revealTimer.current);
    stopAnswerOf(isInscriptionReading);
    setExpanded(false);
    card.setValue(0);
    go("scanning");
    if (inView.current >= 0) lock(inView.current);
  };

  // Leaving the camera ends its own reading (its Durdur button goes with it), not another screen's.
  useEffect(
    () => () => {
      clearTimeout(revealTimer.current);
      stopAnswerOf(isInscriptionReading);
    },
    [],
  );

  // Started afresh after asking: the line is drawn anew then, and a native loop left running
  // would not move it.
  useEffect(() => {
    if (phase !== "scanning" || asking || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, asking, reduceMotion, scan]);

  const guideTop = insets.top + 120;
  // The scan line sweeps down to the status pill, which sits above the card's place.
  const guideHeight = Math.max(0, height - insets.bottom - 140 - guideTop);

  const status = {
    preparing: w.preparing(Math.round(progress * 100)),
    starting: set ? w.cameraOpening : w.downloading,
    scanning: w.scanning,
    locked: w.locked,
    revealed: w.revealed,
  }[phase];
  const found = phase === "locked" || phase === "revealed";
  const subtitle = set ? lookingFor(assets, set.targets, nearby, asked, w) : w.focus;

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {set && <MarkerTracker ref={tracker} target={set.target} overlays={overlays} onEvent={onEvent} style={StyleSheet.absoluteFill} />}

      {phase === "scanning" && !asking && !reduceMotion && guideHeight > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            { top: guideTop, transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, guideHeight] }) }] },
          ]}
        />
      )}

      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title={m.screens.inscription} subtitle={asking ? m.stone.overline : subtitle}>
          {onReadAsText && <GlassIconButton icon="document-text-outline" label={w.readWithoutCamera} onPress={onReadAsText} />}
        </CameraTopBar>
      </View>

      {asking && (
        <AskPanel
          assetId={askAsset}
          takePhoto={takePhoto}
          ready={phase !== "starting" && phase !== "preparing"}
          defaultQuestion={w.askQuestion}
          showPhoto={false}
          onAgain={resumeCamera}
          back={{ label: w.backToScan, onPress: stopAsking }}
        />
      )}

      {!asking && (
      <View style={[styles.bottom, { bottom: insets.bottom + spacing.sm }]} pointerEvents="box-none">
        {phase === "scanning" && offered && (
          <View style={styles.offer}>
            <GlassPill gold icon="sparkles" label={w.askAssistant} spoken={w.askAssistantSpoken} onPress={ask} />
            {/* Kitabe Gönüllüleri: the camera finds none of the listed ones; this may be one that is not. */}
            {askAsset && volunteers && (
              <GlassPill
                icon="document-text-outline"
                label={m.propose.offer}
                spoken={m.propose.offerSpoken}
                onPress={() => router.push({ pathname: "/inscription-propose", params: { asset: askAsset } })}
              />
            )}
          </View>
        )}
        <View style={styles.status} accessibilityRole="text" accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: found ? palette.gulkurusu300 : cameraColors.textSecondary }]} />
          <Text variant="caption" colorValue={cameraColors.text}>
            {status}
          </Text>
        </View>

        {phase === "revealed" && (
          <Animated.View
            style={[
              styles.card,
              { maxHeight: expanded ? height * 0.7 : height * 0.42 },
              { transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
            ]}
          >
            <GlassFill />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.cardContent}>
              <CardContent inscription={inscription} expanded={expanded} />
            </ScrollView>
            <View style={styles.actions}>
              <ReadAloudButton inscription={inscription} />
              {inscription.status === "success" && (
                <GlassPill
                  icon={expanded ? "chevron-down" : "chevron-up"}
                  label={expanded ? w.collapse : w.expand}
                  spoken={expanded ? w.collapseSpoken : w.expandSpoken}
                  onPress={() => setExpanded(!expanded)}
                />
              )}
              <View style={styles.flex} />
              <GlassIconButton icon="refresh" label={w.rescan} onPress={rescan} />
            </View>
          </Animated.View>
        )}
      </View>
      )}
    </View>
  );
}

function CardContent({ inscription, expanded }: { inscription: ResourceWithRetry<InscriptionText>; expanded: boolean }) {
  const m = useMessages();
  const w = m.reading;
  if (inscription.status === "loading") {
    return <ActivityIndicator color={cameraColors.gold} accessibilityLabel={m.common.loading} />;
  }
  if (inscription.status === "error") {
    return (
      <View style={styles.section} accessibilityRole="alert">
        <Text colorValue={cameraColors.text}>{inscription.error.message}</Text>
        <Button label={m.common.retry} onPress={inscription.retry} colors={[cameraColors.gold, cameraColors.onGold]} />
      </View>
    );
  }

  const text = inscription.data;
  return (
    <>
      <Text variant="overline" colorValue={cameraColors.gold}>
        {[w.inscription, text.date].filter(Boolean).join(" · ")}
      </Text>
      <Text variant="heading" colorValue={cameraColors.text} style={styles.name} headingLevel={1} numberOfLines={expanded ? undefined : 1}>
        {inscriptionPlace(text)}
      </Text>
      {text.translation && (
        <Text colorValue={cameraColors.text} numberOfLines={expanded ? undefined : 3} style={styles.translation}>
          {text.translation}
        </Text>
      )}
      {expanded && text.transliteration && (
        <Section title={w.transliteration}>
          <Text colorValue={cameraColors.text} style={styles.italic} language={text.transliterationLanguage}>
            {text.transliteration}
          </Text>
        </Section>
      )}
      {expanded &&
        (text.waqfConditions ? (
          <Section title={w.waqfTerm}>
            <View style={styles.quote}>
              <Text variant="bodyLarge" colorValue={cameraColors.text} style={styles.quoteText}>
                {`“${text.waqfConditions}”`}
              </Text>
            </View>
          </Section>
        ) : (
          text.waqfName && (
            <Section title={w.waqf}>
              <Text colorValue={cameraColors.text}>{text.waqfName}</Text>
            </Section>
          )
        ))}
    </>
  );
}

/** In EVREN's voice, as Rehber's answers; the phone's voice when it cannot be reached. */
function ReadAloudButton({ inscription }: { inscription: ResourceWithRetry<InscriptionText> }) {
  const w = useMessages().reading;
  const { settings } = useA11ySettings();
  const speaking = useSpeaking();
  if (!settings.audioDescription || inscription.status !== "success") return null;
  const key = readAloudKey(inscription.data);
  const reading = speaking === key;
  return (
    <GlassPill
      gold
      icon={reading ? "stop" : "volume-high"}
      label={reading ? w.stop : w.readAloud}
      spoken={reading ? w.stopSpoken : w.readAloudSpoken}
      onPress={() => (reading ? stopAnswer() : void speakAnswer(key, inscription.data.readAloud))}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" colorValue={cameraColors.textSecondary} headingLevel={2}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: cameraColors.background,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  waiting: {
    alignItems: "center",
    justifyContent: "center",
  },
  italic: {
    fontFamily: fontFamily.mono,
    fontStyle: "italic",
  },
  top: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 720,
    alignSelf: "center",
  },
  scanLine: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    height: 2,
    backgroundColor: cameraColors.gold,
    shadowColor: cameraColors.gold,
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  bottom: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.sm,
  },
  offer: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  status: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: cameraGlass,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  cardContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.xxs,
  },
  name: {
    fontFamily: fontFamily.sansBold,
  },
  translation: {
    marginTop: spacing.xxs,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: cameraColors.gold,
    paddingLeft: spacing.md,
  },
  quoteText: {
    fontFamily: fontFamily.display,
  },
});
