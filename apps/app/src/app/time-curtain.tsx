import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AssetDetail, Media } from "@vagabonds/contracts";

import { AssetImage } from "@/components/asset-image";
import { CameraTopBar, GlassIconButton } from "@/components/camera-chrome";
import { DataErrorView } from "@/components/resource-view";
import { Slider } from "@/components/slider";
import { useAsset } from "@/data";
import { speak } from "@/lib/speak";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useScreenReaderEnabled } from "@/lib/use-screen-reader";
import { useA11ySettings } from "@/settings/a11y-settings";
import { useColors } from "@/theme";

/** The asset Zaman Perdesi opens on without `?asset=`. */
const TIME_CURTAIN_ASSET = "bursa-osmangazi-ulucami";

/** What the curtain compares, from the asset's record. */
interface CurtainImages {
  /** The archive photo, or the cover standing in for it until the dataset has one (H8). */
  template: Media;
  standIn: boolean;
  /** Today's photo, shown when no shot has been taken. */
  today: Media | null;
  /** Short label for the template side: the archive year, or what stands in. */
  label: string;
  /** Read aloud by "Sesli betimle". */
  description: string | null;
}

function curtainOf(asset: AssetDetail): CurtainImages | null {
  const archive = asset.media.find((m) => m.kind === "archive_photo") ?? null;
  const template = archive ?? asset.cover;
  if (!template) return null;
  return {
    template,
    standIn: !archive,
    today: asset.cover,
    label: archive ? (archive.archiveYear ? String(archive.archiveYear) : "Arşiv") : "Şablon",
    description:
      [archive && `Arşiv fotoğrafı${archive.archiveYear ? `, ${archive.archiveYear}` : ""}: ${archive.alt}.`, archive?.caption, asset.accessibility.audioDescription]
        .filter(Boolean)
        .join(" ") || null,
  };
}

/**
 * Zaman Perdesi (module 1). The archive photo floats over the camera image as
 * a ghost; the visitor lines it up with the building and shoots from the same
 * angle. Then the screen splits into a before/after curtain: the archive on the
 * left, the new shot on the right. The shot stays on the phone.
 *
 * The photos come from the asset's record. Until the dataset has an archive
 * photo (H8), today's cover stands in as the template, and the screen says so.
 *
 * Without a camera it opens on the curtain with today's cover on the right: on
 * the web (ADR 0001), when a screen reader is on and when the camera cannot
 * start. On a phone the camera is one tap away.
 */
export default function TimeCurtainScreen() {
  const { asset: id } = useLocalSearchParams<{ asset?: string }>();
  const resource = useAsset(id ?? TIME_CURTAIN_ASSET);
  const c = useColors();
  const insets = useSafeAreaInsets();

  let body;
  if (resource.status === "loading") {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={cameraColors.gold} size="large" accessibilityLabel="Yükleniyor" />
      </View>
    );
  } else if (resource.status === "error") {
    body = (
      <View style={[styles.fill, { backgroundColor: c.background, paddingTop: insets.top }]}>
        <DataErrorView error={resource.error} onRetry={resource.retry} />
      </View>
    );
  } else {
    const curtain = resource.data && curtainOf(resource.data);
    body =
      resource.data && curtain ? (
        <TimeCurtain asset={resource.data} curtain={curtain} />
      ) : (
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text colorValue={cameraColors.text} style={styles.centerText}>
            {resource.data ? "Bu eserin henüz fotoğrafı yok; zaman perdesi açılamıyor." : "Eser bulunamadı."}
          </Text>
        </View>
      );
  }

  return (
    <View style={styles.screen}>
      <Head>
        <title>Zaman Perdesi · Vagabonds</title>
      </Head>
      {body}
      {resource.status !== "success" || !resource.data ? (
        <View style={[styles.top, { top: insets.top + spacing.sm }]}>
          <CameraTopBar title="Zaman Perdesi" subtitle="Arşiv karesi" />
        </View>
      ) : null}
    </View>
  );
}

function TimeCurtain({ asset, curtain }: { asset: AssetDetail; curtain: CurtainImages }) {
  const insets = useSafeAreaInsets();
  const web = Platform.OS === "web";
  const screenReader = useScreenReaderEnabled();
  const [mode, setMode] = useState<"camera" | "compare">(web ? "compare" : "camera");
  const [shot, setShot] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { settings } = useA11ySettings();

  // A screen reader cannot follow a camera image; start such users on the curtain.
  useEffect(() => {
    if (screenReader) setMode("compare");
  }, [screenReader]);

  const onShot = useCallback((uri: string) => {
    setShot(uri);
    setMode("compare");
  }, []);
  const onFailure = useCallback((message: string) => {
    setNotice(`${message} Arşivi bugünkü fotoğrafla karşılaştırabilirsin.`);
    setMode("compare");
  }, []);

  const subtitle = curtain.standIn ? "Arşiv fotoğrafı bekleniyor" : `Arşiv karesi · ${curtain.label}`;

  return (
    <>
      {mode === "camera" ? (
        <Viewfinder curtain={curtain} onShot={onShot} onFailure={onFailure} />
      ) : (
        <Curtain
          curtain={curtain}
          shot={shot}
          notice={notice}
          onCamera={
            web
              ? null
              : () => {
                  setNotice(null);
                  setMode("camera");
                }
          }
        />
      )}
      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title={asset.name} subtitle={subtitle}>
          {settings.audioDescription && curtain.description && (
            <GlassIconButton icon="volume-high-outline" label="Sesli mimari betimleme" onPress={() => speak(curtain.description!)} />
          )}
        </CameraTopBar>
      </View>
    </>
  );
}

interface ViewfinderProps {
  curtain: CurtainImages;
  onShot: (uri: string) => void;
  onFailure: (message: string) => void;
}

function Viewfinder({ curtain, onShot, onFailure }: ViewfinderProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [permission] = useCameraPermissions({ request: true });
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ghost, setGhost] = useState(40);
  const flash = useRef(new Animated.Value(0)).current;

  // Asked once on open; a refusal (now or earlier) sends the visitor to the curtain.
  const denied = permission !== null && !permission.granted && permission.status !== "undetermined";
  useEffect(() => {
    if (denied) onFailure("Kamera izni verilmedi.");
  }, [denied, onFailure]);

  const shoot = async () => {
    if (!camera.current || !ready || busy) return;
    setBusy(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 0.8 });
      if (reduceMotion) return onShot(picture.uri);
      flash.setValue(0.9);
      Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => onShot(picture.uri));
    } catch {
      onFailure("Fotoğraf çekilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.fill}>
      <View style={styles.fill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {permission?.granted && (
          <CameraView
            ref={camera}
            style={styles.fill}
            facing="back"
            animateShutter={false}
            onCameraReady={() => setReady(true)}
            onMountError={() => onFailure("Kamera açılamadı.")}
          />
        )}
        <View style={[styles.fill, { opacity: ghost / 100 }]} pointerEvents="none">
          <AssetImage media={curtain.template} decorative fill />
        </View>
      </View>

      <View style={[styles.hintPill, { top: insets.top + 76 }]}>
        <Text variant="caption" colorValue={cameraColors.text}>
          {ready ? "Şablonu binaya oturt, aynı açıdan çek" : "Kamera açılıyor…"}
        </Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
        {curtain.standIn && (
          <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.standIn}>
            Bu eserin arşiv fotoğrafı henüz yok; şablon bugünkü kapak fotoğrafı.
          </Text>
        )}
        <View style={styles.opacityRow}>
          <Text variant="caption" colorValue={cameraColors.textSecondary}>
            Şablon
          </Text>
          <Slider
            value={ghost}
            min={20}
            max={70}
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
            <AssetImage media={curtain.template} decorative fill />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fotoğrafı çek"
            accessibilityState={{ disabled: !ready || busy }}
            disabled={!ready || busy}
            onPress={shoot}
            style={[styles.shutter, { borderColor: ready ? cameraColors.gold : cameraColors.textSecondary }]}
          >
            <View style={[styles.shutterInner, { backgroundColor: ready ? cameraColors.gold : cameraColors.textSecondary }]} />
          </Pressable>
          <Text variant="caption" colorValue={cameraColors.textSecondary} style={[styles.mono, styles.years]}>
            {`${curtain.label}\n→ bugün`}
          </Text>
        </View>
      </View>
      <Animated.View pointerEvents="none" style={[styles.fill, styles.flash, { opacity: flash }]} />
    </View>
  );
}

interface CurtainProps {
  curtain: CurtainImages;
  /** The photo just taken; without one, today's cover is on the right. */
  shot: string | null;
  notice: string | null;
  onCamera: (() => void) | null;
}

/** Before/after: left of the handle is the archive, right is today. */
function Curtain({ curtain, shot, notice, onCamera }: CurtainProps) {
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

  const todayText = shot ? "az önce çektiğin kare" : "bugünkü fotoğraf";
  let caption = `Perdeyi sürükle: solda ${curtain.standIn ? "şablon" : `${curtain.label} arşivi`}, sağda ${todayText}.`;
  if (curtain.standIn) caption += " Arşiv fotoğrafı eklenince sol taraf ona dönecek.";

  return (
    <View style={styles.fill}>
      <View
        style={styles.compare}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Zaman perdesini kaydır: sol ${curtain.standIn ? "şablon" : "arşiv"}, sağ ${todayText}`}
        accessibilityValue={{ min: 0, max: 100, now: pos, text: `Sol taraf yüzde ${pos}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={onAction}
        {...webKeys}
        {...pan.panHandlers}
      >
        <View style={styles.fill} pointerEvents="none">
          {shot ? (
            <Image source={{ uri: shot }} contentFit="cover" style={styles.fill} />
          ) : (
            curtain.today && <AssetImage media={curtain.today} decorative fill />
          )}
        </View>
        <View style={[styles.pastClip, { width: `${pos}%` }]} pointerEvents="none">
          <View style={{ width, height: "100%" }}>
            <AssetImage media={curtain.template} decorative fill />
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
            {curtain.label}
          </Text>
        </View>
        <View pointerEvents="none" style={[styles.tag, styles.tagRight, { top: insets.top + 76 }]}>
          <Text variant="caption" colorValue={cameraColors.text} style={styles.mono}>
            {shot ? "Az önce" : "Bugün"}
          </Text>
        </View>
      </View>
      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text variant="overline" colorValue={cameraColors.textSecondary}>
          ZAMAN PERDESİ AÇILDI
        </Text>
        <Text variant="heading" colorValue={cameraColors.text} headingLevel={2}>
          {curtain.standIn ? "Aynı yer, aynı açı" : "Aynı yer, iki dönem"}
        </Text>
        {notice && (
          <Text variant="caption" colorValue={cameraColors.gold} accessibilityRole="alert">
            {notice}
          </Text>
        )}
        <Text variant="caption" colorValue={cameraColors.textSecondary}>
          {caption}
        </Text>
        <View style={styles.buttons}>
          {onCamera && (
            <Button
              label={shot ? "Yeniden çek" : "Kamerayla çek"}
              onPress={onCamera}
              colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]}
              style={styles.flex}
            />
          )}
          {settings.audioDescription && curtain.description && (
            <Button
              label="Sesli betimle"
              onPress={() => speak(curtain.description!)}
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  centerText: {
    textAlign: "center",
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
  hintPill: {
    position: "absolute",
    alignSelf: "center",
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
    paddingTop: spacing.xl,
    gap: spacing.md,
    backgroundColor: "rgba(4,6,10,0.72)",
  },
  standIn: {
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
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
