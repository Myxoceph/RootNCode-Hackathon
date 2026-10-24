import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import { useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AssetDetail } from "@vagabonds/contracts";

import { INSCRIPTION_ASSET, isTrackable, useTargetSet, type TrackedTarget } from "@/ar/inscription-targets";
import { MarkerTracker } from "@/ar/marker-tracker";
import { trackerFailureText, type TrackerEvent, type TrackerFailure } from "@/ar/mindar";
import { inscriptionOf, type InscriptionText } from "@/ar/use-inscription";
import { CameraTopBar, GlassIconButton } from "@/components/camera-chrome";
import { InscriptionReading } from "@/components/inscription-reading";
import { useAsset, type ResourceWithRetry } from "@/data";
import { announce } from "@/lib/announce";
import { speak } from "@/lib/speak";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useScreenReaderStatus } from "@/lib/use-screen-reader";
import { useA11ySettings } from "@/settings/a11y-settings";

type Phase = "starting" | "scanning" | "locked" | "revealed";

/** How long the gold corners hold on the inscription before its card rises. */
const REVEAL_MS = 800;

/**
 * Taşın Dili (module 2). The camera looks for an inscription with MindAR
 * (ADR 0002); once one is found the page marks its corners, and its reading,
 * today's Turkish and the waqf rise in a card below, from the asset's record.
 * The target comes from the dataset too (Y13); without one, the bundled test
 * targets stand in.
 *
 * The camera-free reading mode (K7) opens instead on the web (no camera,
 * ADR 0001), when a screen reader is on and when the camera cannot start; on a
 * phone it is one tap away.
 */
export default function InscriptionScreen() {
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const web = Platform.OS === "web";
  const screenReader = useScreenReaderStatus();
  const [chosen, setMode] = useState<"camera" | "reading" | null>(web ? "reading" : null);
  const [notice, setNotice] = useState<string | null>(null);
  const asset = useAsset(id ?? INSCRIPTION_ASSET);
  // Opened from an asset whose inscription has no AR target yet: the camera has nothing to find.
  const untrackable = asset.status === "success" && asset.data !== null && !isTrackable(asset.data);
  // Until the system says whether a screen reader is on, open neither, so the camera is not asked for in vain.
  const mode = untrackable ? "reading" : (chosen ?? (screenReader === null ? null : screenReader ? "reading" : "camera"));

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
          notice={untrackable ? "Bu kitabe için henüz kamera hedefi yok; metnini aşağıda okuyabilirsin." : notice}
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
      {mode === "camera" && <InscriptionCamera asset={asset} onFailure={onFailure} onReadAsText={() => setMode("reading")} />}
    </>
  );
}

interface InscriptionCameraProps {
  asset: ResourceWithRetry<AssetDetail | null>;
  onFailure: (reason: TrackerFailure) => void;
  onReadAsText: () => void;
}

function InscriptionCamera({ asset, onFailure, onReadAsText }: InscriptionCameraProps) {
  const insets = useSafeAreaInsets();
  const targetSet = useTargetSet(asset.status === "success" ? asset.data : null, asset.status !== "loading");
  const [tracked, setTracked] = useState<TrackedTarget | null>(null);
  const inscription = inscriptionOf(asset, tracked?.inscriptionId ?? null);
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("starting");
  const [height, setHeight] = useState(0);
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
      setTracked(targetSet?.targets[index] ?? null);
      clearTimeout(revealTimer.current);
      if (reduceMotion) {
        reveal();
        return;
      }
      go("locked");
      announce("Kitabe tanındı, hedef kilitli");
      revealTimer.current = setTimeout(reveal, REVEAL_MS);
    },
    [go, targetSet, reduceMotion, reveal],
  );

  const onEvent = useCallback(
    (event: TrackerEvent) => {
      switch (event.type) {
        case "ready":
          if (phaseRef.current === "starting") go("scanning");
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
    [go, lock, onFailure],
  );

  const rescan = () => {
    clearTimeout(revealTimer.current);
    card.setValue(0);
    go("scanning");
    if (inView.current >= 0) lock(inView.current);
  };

  useEffect(() => () => clearTimeout(revealTimer.current), []);

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

  const cardTop = Math.max(insets.top + 260, height / 2);
  const guideTop = insets.top + 120;
  const guideHeight = Math.max(0, cardTop - 64 - guideTop);

  const status = { starting: "Kamera açılıyor…", scanning: "Kitabe aranıyor…", locked: "Kitabe tanındı · hedef kilitli", revealed: "Kitabe tanındı · hedef kilitli" }[phase];
  const found = phase === "locked" || phase === "revealed";

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {targetSet && <MarkerTracker targetsMind={targetSet.mind} onEvent={onEvent} style={StyleSheet.absoluteFill} />}

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
        <CameraTopBar title="Taşın Dili" subtitle="Kitabeye odaklan, tamamı ekrana sığsın">
          <GlassIconButton icon="document-text-outline" label="Kamerasız oku" onPress={onReadAsText} />
        </CameraTopBar>
      </View>

      <View style={[styles.status, { top: cardTop - 52 }]} accessibilityRole="text" accessibilityLiveRegion="polite">
        <View style={[styles.dot, { backgroundColor: found ? "#5FD3A4" : cameraColors.textSecondary }]} />
        <Text variant="caption" colorValue={cameraColors.text}>
          {status}
        </Text>
      </View>

      <Animated.View
        style={[
          styles.card,
          {
            top: cardTop,
            bottom: insets.bottom + spacing.sm,
            transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
          },
        ]}
        accessibilityElementsHidden={phase !== "revealed"}
        importantForAccessibility={phase === "revealed" ? "auto" : "no-hide-descendants"}
      >
        <ScrollView contentContainerStyle={styles.cardContent}>
          <CardContent inscription={inscription} tracked={tracked} />
          <View style={styles.buttons}>
            <Button
              label="Yeniden tara"
              onPress={rescan}
              colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]}
              style={styles.flex}
            />
            <ReadAloudButton inscription={inscription} />
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function CardContent({ inscription, tracked }: { inscription: ResourceWithRetry<InscriptionText>; tracked: TrackedTarget | null }) {
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
      <Text variant="overline" colorValue={cameraColors.textSecondary} style={styles.center}>
        KİTABE
      </Text>
      <Text variant="heading" colorValue={cameraColors.gold} style={styles.center} headingLevel={1}>
        {text.place}
      </Text>
      {text.date && (
        <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.center}>
          {text.date}
        </Text>
      )}
      {tracked?.test && (
        <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.center}>
          {`Test görseli tanındı (${tracked.label}); gerçek hedef eklenene kadar bu kitabe gösteriliyor.`}
        </Text>
      )}
      {text.translation && (
        <Section title="GÜNÜMÜZ TÜRKÇESİ">
          <Text colorValue={cameraColors.text}>{text.translation}</Text>
        </Section>
      )}
      {text.transliteration && (
        <Section title="OKUNUŞU">
          <Text colorValue={cameraColors.text} style={styles.italic} language={text.transliterationLanguage}>
            {text.transliteration}
          </Text>
        </Section>
      )}
      {text.waqfConditions ? (
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
      )}
    </>
  );
}

function ReadAloudButton({ inscription }: { inscription: ResourceWithRetry<InscriptionText> }) {
  const { settings } = useA11ySettings();
  if (!settings.audioDescription || inscription.status !== "success") return null;
  return (
    <Button
      label="Sesli oku"
      onPress={() => speak(inscription.data.readAloud)}
      colors={[cameraColors.gold, cameraColors.onGold]}
      style={styles.flex}
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
  status: {
    position: "absolute",
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
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    maxWidth: 720,
    alignSelf: "center",
    backgroundColor: cameraColors.panel,
    borderRadius: radius.xl + 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  cardContent: {
    padding: spacing.lg,
    gap: spacing.xs,
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
  buttons: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
