import Ionicons from "@expo/vector-icons/Ionicons";
import { NicknameSchema, VISIT_RADIUS_METERS, type AssetDetail, type VisitResponse } from "@vagabonds/contracts";
import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text, useUi } from "@vagabonds/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MarkerTracker } from "@/ar/marker-tracker";
import { trackerFailureText, type TrackerEvent } from "@/ar/mindar";
import type { TrackerTarget } from "@/ar/tracker-page";
import { AssetImage } from "@/components/asset-image";
import { CameraTopBar } from "@/components/camera-chrome";
import { DataErrorView } from "@/components/resource-view";
import { communityAvailable, DataError, sendVisitProof, useAsset, useCommunity } from "@/data";
import { announce } from "@/lib/announce";
import { currentPosition, type Position } from "@/lib/current-position";
import { unlockAsset } from "@/lib/unlocked-assets";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useScreenReaderStatus } from "@/lib/use-screen-reader";
import { visitSealTarget } from "@/lib/visit-seal";
import { kmBetween } from "@/map/dense-area";

const DEFAULT_ASSET = "bursa-osmangazi-ulucami";
/** The target must stay in view this long before the visit is sealed, so a passing glimpse does not count. */
const HOLD_MS = 1000;

/** Compiled seal targets of this run, by asset and photo: compiling again takes seconds. */
const compiled = new Map<string, string>();

type Phase =
  | { name: "preparing"; progress: number }
  | { name: "starting" }
  | { name: "searching" }
  | { name: "holding" }
  | { name: "sending" }
  | { name: "nickname"; position: Position | null }
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
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const resource = useAsset(id ?? DEFAULT_ASSET);
  const insets = useSafeAreaInsets();
  const screenReader = useScreenReaderStatus();
  const web = Platform.OS === "web";
  const asset = resource.status === "success" ? resource.data : null;
  const target = asset ? visitSealTarget(asset) : null;
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  // A simulation for the demo: "Kilidi aç" unlocks the asset on the map as a sealed visit would.
  const unlock = asset
    ? () => {
        void unlockAsset(asset.id);
        announce(`${asset.name} kilidi açıldı.`);
        setUnlocked(true);
      }
    : undefined;

  let body;
  if (asset && unlocked) {
    body = <Sealed asset={asset} result={{ verified: false, firstVisit: true, newAchievements: [] }} onDone={() => (router.canGoBack() ? router.back() : router.navigate("/"))} />;
  } else if (resource.status === "loading" || (!web && screenReader === null)) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={cameraColors.gold} size="large" accessibilityLabel="Yükleniyor" />
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
          {asset ? "Bu eser için henüz mühür kısmı belirlenmedi." : "Eser bulunamadı."}
        </Text>
        {unlock && <UnlockButton onPress={unlock} />}
      </View>
    );
  } else if (web || screenReader) {
    body = (
      <>
        <SealGuide asset={asset} />
        {unlock && (
          <View style={[styles.unlockFloat, { bottom: insets.bottom + spacing.lg }]}>
            <UnlockButton onPress={unlock} />
          </View>
        )}
      </>
    );
  } else {
    body = <SealCamera asset={asset} onUnlock={unlock} />;
  }

  return (
    <View style={styles.screen}>
      <Head>
        <title>Ziyaret Mührü · Vagabonds</title>
      </Head>
      {body}
      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title="Ziyaret Mührü" subtitle={asset?.name ?? "Eser"} />
      </View>
    </View>
  );
}

/** "Kilidi aç": seals the visit at once, standing in for recognising the part (a demo simulation). */
function UnlockButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Eserin kilidini açar ve ziyaretini mühürler"
      onPress={onPress}
      style={({ pressed }) => [styles.unlock, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      <Ionicons name="lock-open" size={18} color={cameraColors.onGold} />
      <Text variant="label" colorValue={cameraColors.onGold} style={styles.unlockText}>
        Kilidi aç
      </Text>
    </Pressable>
  );
}

/** Without a camera: the part to find, and how sealing works on site. */
function SealGuide({ asset }: { asset: AssetDetail }) {
  const insets = useSafeAreaInsets();
  const { photo, part } = visitSealTarget(asset)!;
  return (
    <ScrollView contentContainerStyle={[styles.guide, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + spacing.xl }]}>
      <Text variant="overline" colorValue={cameraColors.gold}>
        MÜHÜR KISMI · {part.toLocaleUpperCase("tr")}
      </Text>
      <View style={styles.guidePhoto}>
        <AssetImage media={photo} />
      </View>
      <Text variant="heading" colorValue={cameraColors.text}>
        Eserin yanındayken {part.toLocaleLowerCase("tr")} kısmını bul ve kameraya göster
      </Text>
      <Text colorValue={cameraColors.textSecondary}>
        Telefon tanıyınca ziyaretin mühürlenir: eserde bulunduğun kanıtlanır, rozet ve puan kazanırsın. Mühür telefonda, eserin{" "}
        {VISIT_RADIUS_METERS} m yakınında çalışır.
      </Text>
    </ScrollView>
  );
}

function SealCamera({ asset, onUnlock }: { asset: AssetDetail; onUnlock?: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useCommunity();
  const { photo, part } = visitSealTarget(asset)!;
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

  const send = useCallback(
    async (position: Position | null, nickname?: string) => {
      go({ name: "sending" });
      try {
        const result = await sendVisitProof(asset.id, { mediaKey: photo.key, ...(position ?? {}) }, nickname);
        go({ name: "sealed", result });
        announce(`Ziyaretin mühürlendi.${result.newAchievements.length ? ` ${result.newAchievements.length} yeni rozet kazandın.` : ""}`);
      } catch (error) {
        go({ name: "failed", message: error instanceof DataError ? error.message : "Mühür gönderilemedi." });
      }
    },
    [asset.id, photo.key, go],
  );

  const seal = useCallback(async () => {
    go({ name: "sending" });
    if (!communityAvailable) return go({ name: "failed", message: "Mühür için sunucu gerekiyor; bu sürüm örnek veriyle çalışıyor." });
    const position = await currentPosition();
    const point = asset.coordinates;
    // The API checks the same; saying it here names the distance and saves a request.
    if (point && !point.approximate) {
      if (!position) return go({ name: "failed", message: "Mühür için konumun gerekiyor. Konum iznini açıp tekrar dene." });
      const meters = Math.round(kmBetween(position, point) * 1000);
      if (meters > VISIT_RADIUS_METERS) {
        return go({ name: "failed", message: `Esere ${formatMeters(meters)} uzaktasın. Mühür için ${VISIT_RADIUS_METERS} m yakınına gel.` });
      }
    }
    if (!user) return go({ name: "nickname", position });
    await send(position);
  }, [asset.coordinates, user, send, go]);

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
          if (now === "preparing" || now === "starting") go({ name: "searching" });
          break;
        case "found":
          if (now !== "searching") break;
          go({ name: "holding" });
          announce("Tanındı, telefonu sabit tut.");
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
          go({ name: "failed", message: trackerFailureText[event.reason] });
          break;
      }
    },
    [go, key, hold, reduceMotion, seal],
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

      <View style={[styles.hint, { top: insets.top + 72 }]} accessible accessibilityLabel={`Bulunacak kısım: ${part}. ${photo.alt}`}>
        <View style={styles.hintPhoto}>
          <AssetImage media={photo} fill decorative />
        </View>
        <Text variant="caption" colorValue={cameraColors.gold} style={styles.mono} numberOfLines={1}>
          {part.toLocaleUpperCase("tr")}
        </Text>
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityLiveRegion="polite">
        {onUnlock && <UnlockButton onPress={onUnlock} />}
        <PanelBody phase={phase} hold={hold} onRetry={retry} onNickname={(nickname, position) => void send(position, nickname)} />
      </View>
    </View>
  );
}

function PanelBody({
  phase,
  hold,
  onRetry,
  onNickname,
}: {
  phase: Phase;
  hold: Animated.Value;
  onRetry: () => void;
  onNickname: (nickname: string, position: Position | null) => void;
}) {
  switch (phase.name) {
    case "preparing":
      return (
        <>
          <Text variant="heading" colorValue={cameraColors.text}>
            Eser hazırlanıyor…
          </Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${Math.round(phase.progress * 100)}%` }]} />
          </View>
          <Text variant="caption" colorValue={cameraColors.textSecondary}>
            Fotoğraf telefonda tanınmaya hazırlanıyor; ikinci açılışta beklemezsin.
          </Text>
        </>
      );
    case "starting":
    case "sending":
      return (
        <View style={styles.row}>
          <ActivityIndicator color={cameraColors.gold} />
          <Text variant="label" colorValue={cameraColors.text}>
            {phase.name === "starting" ? "Kamera açılıyor…" : "Mühürleniyor…"}
          </Text>
        </View>
      );
    case "searching":
      return (
        <>
          <Text variant="heading" colorValue={cameraColors.text}>
            Eserin bu kısmını kadraja al
          </Text>
          <Text colorValue={cameraColors.textSecondary}>Köşedeki fotoğraftaki açıdan bak; tanınınca altın köşeler belirir.</Text>
        </>
      );
    case "holding":
      return (
        <>
          <Text variant="heading" colorValue={cameraColors.gold}>
            Tanındı, sabit tut
          </Text>
          <View style={styles.track}>
            <Animated.View style={[styles.bar, { width: hold.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
          </View>
        </>
      );
    case "nickname":
      return <NicknameStep onSubmit={(nickname) => onNickname(nickname, phase.position)} />;
    case "failed":
      return (
        <>
          <Text colorValue={cameraColors.text} accessibilityRole="alert">
            {phase.message}
          </Text>
          <Button label="Tekrar dene" onPress={onRetry} colors={[cameraColors.gold, cameraColors.onGold]} />
        </>
      );
    case "sealed":
      return null;
  }
}

/** A visitor without a session names the seal once; the same nickname signs their notes. */
function NicknameStep({ onSubmit }: { onSubmit: (nickname: string) => void }) {
  const { textScale } = useUi();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    if (!NicknameSchema.safeParse(nickname).success) {
      setError("Takma ad 2-32 karakter olmalı; harf, rakam, boşluk, nokta, alt çizgi ve tire kullanılabilir.");
      return;
    }
    onSubmit(nickname.trim());
  };
  return (
    <>
      <Text variant="heading" colorValue={cameraColors.gold}>
        Tanındı! Mühür kimin adına?
      </Text>
      <TextInput
        value={nickname}
        onChangeText={(text) => {
          setNickname(text);
          setError(null);
        }}
        onSubmitEditing={submit}
        accessibilityLabel="Takma ad"
        accessibilityHint="Mühür ve notların bu adla görünür"
        placeholder="Takma ad"
        placeholderTextColor={cameraColors.textSecondary}
        autoCapitalize="none"
        returnKeyType="done"
        style={[styles.input, { fontSize: 16 * textScale, lineHeight: 24 * textScale }]}
      />
      {error && (
        <Text variant="caption" colorValue={cameraColors.text} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Button label="Mühürle" onPress={submit} colors={[cameraColors.gold, cameraColors.onGold]} />
    </>
  );
}

/** The seal comes down like a stamp, then what the visit earned. */
function Sealed({ asset, result, onDone }: { asset: AssetDetail; result: Pick<VisitResponse, "verified" | "firstVisit" | "newAchievements">; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const stamp = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(stamp, { toValue: 1, damping: 9, stiffness: 140, mass: 0.8, useNativeDriver: true }).start();
  }, [reduceMotion, stamp]);

  const scale = stamp.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] });
  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <ScrollView contentContainerStyle={[styles.sealed, { paddingTop: insets.top + 96, paddingBottom: insets.bottom + spacing.xl }]}>
      <Animated.View style={[styles.seal, { opacity: stamp, transform: [{ scale }, { rotate: "-8deg" }] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.sealInner}>
          <Text style={styles.sealCaption} colorValue={cameraColors.gold}>
            ZİYARET MÜHRÜ
          </Text>
          <Text variant="heading" colorValue={cameraColors.text} style={styles.centerText} numberOfLines={2}>
            {asset.name}
          </Text>
          <Text style={styles.sealCaption} colorValue={cameraColors.textSecondary}>
            {date.toLocaleUpperCase("tr")}
          </Text>
        </View>
      </Animated.View>

      <Text variant="title" colorValue={cameraColors.text} style={styles.centerText} headingLevel={2}>
        Ziyaretin mühürlendi
      </Text>
      <Text colorValue={cameraColors.textSecondary} style={styles.centerText}>
        {result.verified ? "Konumun da doğrulandı. " : ""}
        {result.firstVisit ? "Bu eser artık haritanda açık." : "Bu eseri daha önce de ziyaret etmiştin; ziyaretin artık mühürlü."}
      </Text>

      {result.newAchievements.length > 0 && (
        <View style={styles.badges}>
          <Text variant="overline" colorValue={cameraColors.gold}>
            YENİ ROZETLER
          </Text>
          {result.newAchievements.map((achievement) => (
            <View key={achievement.code} style={styles.badge} accessible accessibilityLabel={`${achievement.title}, ${achievement.points} puan. ${achievement.description}`}>
              <Text style={styles.badgeIcon}>{achievement.badge}</Text>
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

      <Button label="Tamam" onPress={onDone} colors={[cameraColors.gold, cameraColors.onGold]} style={styles.done} />
    </ScrollView>
  );
}

/** The ~1280 px JPEG of the photo: big enough to recognise, small enough to compile in seconds. */
function compileSource(media: AssetDetail["media"][number]): string {
  const jpgs = [...media.sources.jpg].sort((a, b) => a.width - b.width);
  return (jpgs.find((s) => s.width >= 1000) ?? jpgs[jpgs.length - 1] ?? media.sources.webp[0]!).url;
}

function formatMeters(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km` : `${meters} m`;
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
    backgroundColor: cameraColors.gold,
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
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    color: cameraColors.text,
    fontFamily: fontFamily.sans,
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
  seal: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: cameraColors.gold,
    padding: 8,
    marginBottom: spacing.lg,
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
  badgeIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  done: {
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
});
