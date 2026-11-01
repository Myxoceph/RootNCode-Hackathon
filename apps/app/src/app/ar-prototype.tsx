import { Button, cameraColors, cameraGlass, fontFamily, radius, spacing, Text } from "@vagabonds/ui";
import Head from "expo-router/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MarkerTracker } from "@/ar/marker-tracker";
import { trackerFailureText, type TrackerEvent, type TrackerFailure, type TrackerStep } from "@/ar/mindar";
import { testTargetLabels, testTargetsMind } from "@/ar/test-targets.generated";
import { CameraTopBar } from "@/components/camera-chrome";

/** The test targets never change; one object, so the page is not rebuilt on every render. */
const testTarget = { mind: testTargetsMind };

const stepText: Record<TrackerStep, string> = {
  page: "Sayfa yüklendi",
  library: "MindAR indirildi",
  compile: "Hedef derleniyor",
  camera: "Kamera izni alındı",
  video: "Görüntü geliyor",
  targets: "Hedefler yüklendi",
};

interface Metrics {
  /** From opening the screen to the tracker searching (camera, MindAR download, warm-up). */
  startMs: number | null;
  /** From searching to the first target found. */
  firstFoundMs: number | null;
  found: number;
  lost: number;
  fps: number | null;
}

const emptyMetrics: Metrics = { startMs: null, firstFoundMs: null, found: 0, lost: 0, fps: null };

/**
 * AR prototype for the decision record (Y5, ADR 0002): MindAR image tracking in
 * a WebView, measured on a real phone. Shows what the tracker reports and how
 * long each step takes. Point the camera at a test target opened on another
 * screen (src/ar/test-targets/). Reached from the Kamera tab in development.
 */
export default function ArPrototypeScreen() {
  const insets = useSafeAreaInsets();
  const opened = useRef(Date.now());
  const readyAt = useRef<number | null>(null);
  const [run, setRun] = useState(0);
  const [status, setStatus] = useState("Kamera açılıyor…");
  const [target, setTarget] = useState<number | null>(null);
  const [failure, setFailure] = useState<TrackerFailure | null>(null);
  // Where start-up got to, and the raw error: what a tester reports when it does not open.
  const [step, setStep] = useState("Başlıyor");
  const [detail, setDetail] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);

  // Android and the web read the live region below; iOS needs an explicit announcement.
  useEffect(() => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(status);
  }, [status]);

  const onEvent = useCallback((event: TrackerEvent) => {
    switch (event.type) {
      case "ready":
        readyAt.current = Date.now();
        setMetrics((m) => ({ ...m, startMs: Date.now() - opened.current }));
        setStatus("Kitabe aranıyor…");
        break;
      case "found":
        setTarget(event.target);
        setStatus(`Tanındı: ${testTargetLabels[event.target] ?? `hedef ${event.target}`}`);
        setMetrics((m) => ({
          ...m,
          found: m.found + 1,
          firstFoundMs: m.firstFoundMs ?? (readyAt.current ? Date.now() - readyAt.current : null),
        }));
        break;
      case "lost":
        setTarget(null);
        setStatus("Kitabe kayboldu, aranıyor…");
        setMetrics((m) => ({ ...m, lost: m.lost + 1 }));
        break;
      case "step":
        setStep(stepText[event.step]);
        break;
      case "stats":
        setMetrics((m) => ({ ...m, fps: event.fps }));
        break;
      case "error":
        setFailure(event.reason);
        setStatus(trackerFailureText[event.reason]);
        setDetail(event.message);
        break;
    }
  }, []);

  const restart = () => {
    opened.current = Date.now();
    readyAt.current = null;
    setTarget(null);
    setFailure(null);
    setStep("Başlıyor");
    setDetail(null);
    setMetrics(emptyMetrics);
    setStatus("Kamera açılıyor…");
    setRun((n) => n + 1);
  };

  const rows: Array<[string, string]> = [
    ["Son adım", step],
    ["Başlatma", seconds(metrics.startMs)],
    ["İlk tanıma", seconds(metrics.firstFoundMs)],
    ["Tanındı / kayboldu", `${metrics.found} / ${metrics.lost}`],
    ["İşlenen kare", metrics.fps === null ? "–" : `${metrics.fps.toLocaleString("tr-TR")} /sn`],
  ];

  return (
    <View style={styles.screen}>
      <Head>
        <title>AR prototipi · Vagabonds</title>
      </Head>
      {failure === null && <MarkerTracker key={run} target={testTarget} onEvent={onEvent} style={StyleSheet.absoluteFill} />}

      <View style={[styles.top, { top: insets.top + spacing.sm }]}>
        <CameraTopBar title="AR prototipi" subtitle="Y5 · MindAR, WebView içinde" />
      </View>

      <View style={[styles.panel, { bottom: insets.bottom + spacing.sm }]}>
        <View style={styles.status} accessibilityRole="text" accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: target !== null ? "#5FD3A4" : cameraColors.textSecondary }]} />
          <Text variant="label" colorValue={cameraColors.text} style={styles.flex}>
            {status}
          </Text>
        </View>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
            <Text variant="caption" colorValue={cameraColors.textSecondary}>
              {label}
            </Text>
            <Text variant="caption" colorValue={cameraColors.text} style={styles.mono}>
              {value}
            </Text>
          </View>
        ))}
        {detail && (
          <Text variant="caption" colorValue={cameraColors.textSecondary} style={styles.mono} selectable>
            {detail}
          </Text>
        )}
        <Button label="Yeniden başlat" onPress={restart} colors={[cameraColors.gold, cameraColors.onGold]} />
      </View>
    </View>
  );
}

function seconds(ms: number | null): string {
  return ms === null ? "–" : `${(ms / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} sn`;
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
  top: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    maxWidth: 720,
    alignSelf: "center",
  },
  panel: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    maxWidth: 720,
    alignSelf: "center",
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: cameraGlass,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  mono: {
    fontFamily: fontFamily.mono,
  },
});
