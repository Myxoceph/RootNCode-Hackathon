import { Button, cameraColors, cameraGlass, spacing, Text } from "@vagabonds/ui";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AskPanel } from "@/components/ask-panel";
import { CameraTopBar } from "@/components/camera-chrome";
import { shrinkPhoto } from "@/data/vision";
import { useMessages } from "@/i18n";

/**
 * Taşa Sor: the visitor points the camera at a detail of the asset (a tile, a door, a carving) and
 * asks about it, with the shutter ("Bu ne?") or by voice (`AskPanel`). Opened for an asset with no
 * inscription the camera can find: Taşın Dili's screen asks the same from its own camera. Without
 * an asset (opened where none is near) the answer comes from the photo alone. A phone feature
 * (ADR 0001). Photos are not stored.
 */
export default function StoneAskScreen() {
  const m = useMessages();
  const w = m.stone;
  const { asset, name } = useLocalSearchParams<{ asset?: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const takePhoto = async () => {
    const shot = await camera.current?.takePictureAsync({ quality: 0.8, skipProcessing: false });
    if (!shot) throw new Error("no photo");
    return shrinkPhoto(shot.uri);
  };

  const title = name ?? m.screens.stoneAsk;
  const subtitle = w.overline;
  const head = (
    <Head>
      <title>{m.common.title(m.screens.stoneAsk)}</title>
    </Head>
  );

  // No camera on the web (ADR 0001). Without an asset, the answer comes from the photo alone.
  if (Platform.OS === "web") {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + spacing.md }]}>
        {head}
        <Text colorValue={cameraColors.text} style={styles.centerText}>
          {w.phoneOnly}
        </Text>
        <Button label={w.goBack} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]} />
      </View>
    );
  }

  if (permission && !permission.granted) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top + spacing.md }]}>
        {head}
        <Text colorValue={cameraColors.text} style={styles.centerText} accessibilityRole="alert">
          {w.needsCamera}
        </Text>
        <Button label={w.goBack} onPress={() => router.back()} colors={[cameraGlass, cameraColors.text, "rgba(255,255,255,0.16)"]} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {head}
      {permission?.granted && (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} accessible={false} importantForAccessibility="no-hide-descendants" />
      )}
      {/* Before the panel in the tree, so the title is read first (WCAG 1.3.2); drawn over the photo by zIndex. */}
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <CameraTopBar title={title} subtitle={subtitle} />
      </View>
      <AskPanel assetId={asset ?? null} takePhoto={takePhoto} ready={ready} showPhoto />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: cameraColors.background },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.lg },
  centerText: { textAlign: "center" },
  top: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, elevation: 2, paddingHorizontal: spacing.md },
});
