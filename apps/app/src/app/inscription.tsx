import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import { useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AssetDetail } from "@vagabonds/contracts";

import { useInscriptionScope } from "@/ar/inscription-scope";
import { isTrackable, rememberCompiledSet, useTargetSet, type TrackedTarget } from "@/ar/inscription-targets";
import { MarkerTracker } from "@/ar/marker-tracker";
import { trackerFailureText, type TrackerEvent, type TrackerFailure } from "@/ar/mindar";
import { inscriptionOf, inscriptionText, readAloudKey, type InscriptionText } from "@/ar/use-inscription";
import { CameraTopBar, GlassIconButton } from "@/components/camera-chrome";
import { GlassFill } from "@/components/city-asset-cards";
import { InscriptionReading } from "@/components/inscription-reading";
import { DataError, type ResourceWithRetry } from "@/data";
import { announce } from "@/lib/announce";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { speakAnswer, stopAnswer, useSpeaking } from "@/lib/voice";
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
        ? { status: "error", error: new DataError("unavailable", "Veriye şu an ulaşılamıyor.", []), retry }
        : { status: "success", data: scope.assets[0] ?? null, retry };
  const loaded = scope.status !== "loading";
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

  const onFailure = useCallback((reason: TrackerFailure) => {
    setNotice(`${trackerFailureText[reason]} Kitabeyi aşağıda metin olarak okuyabilirsin.`);
    setMode("reading");
  }, []);

  return (
    <>
      <Head>
        <title>Taşın Dili · Vagabonds</title>
      </Head>
      {mode === "reading" && (
        <InscriptionReading
          inscription={inscriptionOf(asset, null)}
          notice={untrackable && asset.status === "success" ? "Bu kitabenin kamerayla tanınacak fotoğrafı henüz yok; metnini aşağıda okuyabilirsin." : notice}
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
      {mode === "camera" && trackable.length > 0 && (
        <InscriptionCamera
          assets={trackable}
          nearby={scope.status === "ready" && scope.nearby}
          asked={id !== undefined}
          onFailure={onFailure}
          onReadAsText={() => setMode("reading")}
        />
      )}
      {mode === null && (
        <View style={[styles.screen, styles.waiting]}>
          <ActivityIndicator color={cameraColors.gold} size="large" accessibilityLabel="Yükleniyor" />
          <View style={[styles.top, { top: insets.top + spacing.sm }]}>
            <CameraTopBar title="Taşın Dili" subtitle="Yükleniyor" />
          </View>
        </View>
      )}
    </>
  );
}

interface InscriptionCameraProps {
  /** The assets whose inscriptions are looked for; each has at least one. */
  assets: AssetDetail[];
  /** They are the ones near the visitor. */
  nearby: boolean;
  /** Opened from an asset's page. */
  asked: boolean;
  onFailure: (reason: TrackerFailure) => void;
  onReadAsText: () => void;
}

/**
 * What the bar under the title says is being looked for: the tracked targets (capped at
 * `MAX_TARGETS`), counted by the assets they are on.
 */
function lookingFor(assets: AssetDetail[], targets: TrackedTarget[], nearby: boolean, asked: boolean): string {
  const on = assets.filter((asset) => targets.some((t) => t.assetId === asset.id));
  const single = on.length === 1 ? `${on[0]!.name} ${targets.length === 1 ? "kitabesi" : `${targets.length} kitabesi`}` : null;
  if (!nearby && !asked) return `Yakında yok · örnek: ${single ?? `${on.length} eser`}`;
  const many = `${on.length} ${asked ? "yapının" : "eserin"} ${targets.length} kitabesi`;
  return nearby ? `Yakındaki ${single ?? many}` : (single ?? many);
}

function InscriptionCamera({ assets, nearby, asked, onFailure, onReadAsText }: InscriptionCameraProps) {
  const insets = useSafeAreaInsets();
  const set = useTargetSet(assets);
  const overlays = useMemo(() => set?.targets.map((t) => t.overlay), [set]);
  const [tracked, setTracked] = useState<TrackedTarget | null>(null);
  const trackedAsset = assets.find((a) => a.id === tracked?.assetId) ?? assets[0]!;
  const text = inscriptionText(trackedAsset, tracked?.inscriptionId ?? "");
  const noRetry = useCallback(() => {}, []);
  const inscription: ResourceWithRetry<InscriptionText> = text
    ? { status: "success", data: text, retry: noRetry }
    : inscriptionOf({ status: "success", data: trackedAsset, retry: noRetry }, null);
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

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const reveal = useCallback(() => {
    go("revealed");
    announce("Kitabe çözüldü. Okunuşu ve günümüz Türkçesi aşağıda.");
    if (reduceMotion) card.setValue(1);
    else Animated.timing(card, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [card, go, reduceMotion]);

  const lock = useCallback(
    (index: number) => {
      setTracked(set?.targets[index] ?? null);
      clearTimeout(revealTimer.current);
      if (reduceMotion) {
        reveal();
        return;
      }
      go("locked");
      announce("Kitabe tanındı, hedef kilitli");
      revealTimer.current = setTimeout(reveal, REVEAL_MS);
    },
    [go, set, reduceMotion, reveal],
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
          if (phaseRef.current === "scanning") lock(event.target);
          break;
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

  const rescan = () => {
    clearTimeout(revealTimer.current);
    stopAnswer();
    setExpanded(false);
    card.setValue(0);
    go("scanning");
    if (inView.current >= 0) lock(inView.current);
  };

  // Leaving the camera ends the reading: its Durdur button goes with it.
  useEffect(
    () => () => {
      clearTimeout(revealTimer.current);
      stopAnswer();
    },
    [],
  );

  useEffect(() => {
    if (phase !== "scanning" || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, reduceMotion, scan]);

  const guideTop = insets.top + 120;
  // The scan line sweeps down to the status pill, which sits above the card's place.
  const guideHeight = Math.max(0, height - insets.bottom - 140 - guideTop);

  const status = {
    preparing: `Kitabeler hazırlanıyor %${Math.round(progress * 100)}`,
    starting: set ? "Kamera açılıyor…" : "Kitabeler indiriliyor…",
    scanning: "Kitabe aranıyor…",
    locked: "Kitabe tanındı · hedef kilitli",
    revealed: "Kitabe tanındı · çevirisi taşın üstünde",
  }[phase];
  const found = phase === "locked" || phase === "revealed";
  const subtitle = set ? lookingFor(assets, set.targets, nearby, asked) : "Kitabeye odaklan, tamamı ekrana sığsın";

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {set && <MarkerTracker target={set.target} overlays={overlays} onEvent={onEvent} style={StyleSheet.absoluteFill} />}

      {phase === "scanning" && !reduceMotion && guideHeight > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanLine,
            { top: guideTop, transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, guideHeight] }) }] },
          ]}
        />
      )}

      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title="Taşın Dili" subtitle={subtitle}>
          <GlassIconButton icon="document-text-outline" label="Kamerasız oku" onPress={onReadAsText} />
        </CameraTopBar>
      </View>

      <View style={[styles.bottom, { bottom: insets.bottom + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.status} accessibilityRole="text" accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: found ? "#5FD3A4" : cameraColors.textSecondary }]} />
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
            <ScrollView style={styles.scroll} contentContainerStyle={styles.cardContent} scrollEnabled={expanded}>
              <CardContent inscription={inscription} expanded={expanded} />
            </ScrollView>
            <View style={styles.actions}>
              <ReadAloudButton inscription={inscription} />
              {inscription.status === "success" && hasMore(inscription.data) && (
                <Pill
                  icon={expanded ? "chevron-down" : "chevron-up"}
                  label={expanded ? "Daralt" : "Devamı"}
                  spoken={expanded ? "Kartı daralt" : "Okunuşu ve vakfiyeyi göster"}
                  onPress={() => setExpanded(!expanded)}
                />
              )}
              <View style={styles.flex} />
              <GlassIconButton icon="refresh" label="Yeniden tara" onPress={rescan} />
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** Whether the card has more than its first lines: the reading or the waqf. */
function hasMore(text: InscriptionText): boolean {
  return !!(text.transliteration || text.waqfConditions || text.waqfName || (text.translation && text.translation.length > 160));
}

function CardContent({ inscription, expanded }: { inscription: ResourceWithRetry<InscriptionText>; expanded: boolean }) {
  if (inscription.status === "loading") {
    return <ActivityIndicator color={cameraColors.gold} accessibilityLabel="Yükleniyor" />;
  }
  if (inscription.status === "error") {
    return (
      <View style={styles.section} accessibilityRole="alert">
        <Text colorValue={cameraColors.text}>{inscription.error.message}</Text>
        <Button label="Tekrar dene" onPress={inscription.retry} colors={[cameraColors.gold, cameraColors.onGold]} />
      </View>
    );
  }

  const text = inscription.data;
  return (
    <>
      <Text variant="overline" colorValue={cameraColors.gold}>
        {["KİTABE", text.date].filter(Boolean).join(" · ")}
      </Text>
      <Text variant="heading" colorValue={cameraColors.text} style={styles.name} headingLevel={1} numberOfLines={expanded ? undefined : 1}>
        {text.place}
      </Text>
      {text.translation && (
        <Text colorValue={cameraColors.text} numberOfLines={expanded ? undefined : 3} style={styles.translation}>
          {text.translation}
        </Text>
      )}
      {expanded && text.transliteration && (
        <Section title="OKUNUŞU">
          <Text colorValue={cameraColors.text} style={styles.italic} language={text.transliterationLanguage}>
            {text.transliteration}
          </Text>
        </Section>
      )}
      {expanded &&
        (text.waqfConditions ? (
          <Section title="VAKFİYENİN ŞARTI">
            <View style={styles.quote}>
              <Text variant="bodyLarge" colorValue={cameraColors.text} style={styles.quoteText}>
                {`“${text.waqfConditions}”`}
              </Text>
            </View>
          </Section>
        ) : (
          text.waqfName && (
            <Section title="VAKIF">
              <Text colorValue={cameraColors.text}>{text.waqfName}</Text>
            </Section>
          )
        ))}
    </>
  );
}

/** A small rounded button on the card, as the map's action chips. */
function Pill({ icon, label, spoken, onPress, gold = false }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; spoken: string; onPress: () => void; gold?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, gold ? styles.pillGold : styles.pillGlass, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={gold ? cameraColors.onGold : cameraColors.text} />
      <Text variant="label" colorValue={gold ? cameraColors.onGold : cameraColors.text} style={styles.pillText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** In EVREN's voice, as Rehber's answers; the phone's voice when it cannot be reached. */
function ReadAloudButton({ inscription }: { inscription: ResourceWithRetry<InscriptionText> }) {
  const { settings } = useA11ySettings();
  const speaking = useSpeaking();
  if (!settings.audioDescription || inscription.status !== "success") return null;
  const key = readAloudKey(inscription.data);
  const reading = speaking === key;
  return (
    <Pill
      gold
      icon={reading ? "stop" : "volume-high"}
      label={reading ? "Durdur" : "Sesli oku"}
      spoken={reading ? "Sesli okumayı durdur" : "Kitabeyi sesli oku"}
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
  center: {
    textAlign: "center",
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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  pillGold: {
    backgroundColor: cameraColors.gold,
  },
  pillGlass: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  pillText: {
    fontFamily: fontFamily.sansSemiBold,
  },
  pressed: {
    opacity: 0.8,
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
