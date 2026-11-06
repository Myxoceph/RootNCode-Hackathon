import Ionicons from "@expo/vector-icons/Ionicons";
import type { VisionAskResponse } from "@vagabonds/contracts";
import { Button, cameraColors, cameraGlass, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CameraTopBar, GlassPill } from "@/components/camera-chrome";
import { DataError } from "@/data/errors";
import { askStone, shrinkPhoto } from "@/data/vision";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { answerParts } from "@/lib/chat";
import { useVoiceQuestion } from "@/lib/use-voice-question";
import { speakAnswer, stopAnswer, stopAnswerOf, useSpeaking } from "@/lib/voice";

type Phase = { kind: "aim" } | { kind: "looking"; photo: string; question: string | null } | { kind: "answered"; photo: string; question: string | null; response: VisionAskResponse; plain: string } | { kind: "failed"; photo: string | null; message: string };

/**
 * Taşa Sor: the visitor points the camera at a detail of the asset (a tile, a door, a carving) and
 * asks about it, with the shutter ("Bu ne?") or by voice. The photo freezes and the answer, from
 * what it shows and the asset's record, appears under it and is read aloud. A phone feature: the
 * asset's page offers it only on a phone (ADR 0001). Photos are not stored.
 */
export default function StoneAskScreen() {
  const m = useMessages();
  const w = m.stone;
  const { asset, name } = useLocalSearchParams<{ asset?: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: "aim" });
  const [ready, setReady] = useState(false);
  const shown = useRef(true);
  const speaking = useSpeaking();

  // The answers this screen read aloud; leaving it ends them, not another screen's reading.
  const mine = useRef(new Set<string>());
  useEffect(() => {
    shown.current = true;
    const own = mine.current;
    return () => {
      shown.current = false;
      stopAnswerOf((key) => own.has(key));
    };
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  async function capture(question: string | null) {
    if (!asset || phase.kind === "looking" || !camera.current || !ready) return;
    stopAnswer();
    let photo: string | null = null;
    try {
      const shot = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      if (!shot) throw new Error("no photo");
      photo = await shrinkPhoto(shot.uri);
    } catch {
      setPhase({ kind: "failed", photo: null, message: w.photoFailed });
      return;
    }
    setPhase({ kind: "looking", photo, question });
    announce(w.lookingSaid);
    try {
      const response = await askStone(photo, asset, question ?? undefined);
      if (!shown.current) return;
      const plain = answerParts(response.answer, response.citations)
        .map((part) => (part.kind === "text" ? part.text : ""))
        .join("")
        .trim();
      setPhase({ kind: "answered", photo, question, response, plain });
      // Read aloud, the answer is not announced too: a screen reader would talk over the voice.
      mine.current.add(response.answer);
      void speakAnswer(response.answer, plain);
    } catch (error) {
      if (!shown.current) return;
      const message = error instanceof DataError ? error.message : m.errors.vision.down;
      setPhase({ kind: "failed", photo, message });
      announce(message);
    }
  }

  const voice = useVoiceQuestion(
    (text) => void capture(text),
    (message) => {
      setPhase({ kind: "failed", photo: null, message });
      announce(message);
    },
  );

  function again() {
    stopAnswer();
    setPhase({ kind: "aim" });
  }

  const title = name ?? m.screens.stoneAsk;
  const subtitle = w.overline;
  const head = (
    <Head>
      <title>{m.common.title(m.screens.stoneAsk)}</title>
    </Head>
  );

  // No camera on the web (ADR 0001), nor without an asset to ground the answer in.
  if (Platform.OS === "web" || !asset) {
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

  const photo = phase.kind === "aim" ? null : phase.photo;
  const listening = voice.phase !== "idle";

  return (
    <View style={styles.screen}>
      {head}
      {permission?.granted && (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} accessible={false} importantForAccessibility="no-hide-descendants" />
      )}
      {photo && <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={w.yourPhoto} />}

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <CameraTopBar title={title} subtitle={subtitle} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        {phase.kind === "aim" && !listening && (
          <Text variant="caption" colorValue={cameraColors.text} style={[styles.hint, styles.centerText]}>
            {w.aim}
          </Text>
        )}
        {listening && (
          <Text variant="caption" colorValue={cameraColors.text} style={[styles.hint, styles.centerText]} accessibilityLiveRegion="polite">
            {voice.phase === "recording" ? w.listening(voice.seconds) : w.understanding}
          </Text>
        )}

        {phase.kind === "looking" && (
          <View style={styles.card} accessibilityLiveRegion="polite">
            {phase.question && (
              <Text variant="caption" colorValue={cameraColors.textSecondary}>
                “{phase.question}”
              </Text>
            )}
            <View style={styles.row}>
              <ActivityIndicator color={cameraColors.gold} />
              <Text colorValue={cameraColors.text}>{w.looking}</Text>
            </View>
          </View>
        )}

        {phase.kind === "answered" && (
          <View style={styles.card}>
            <ScrollView style={styles.answerScroll} contentContainerStyle={styles.answerContent}>
              {phase.question && (
                <Text variant="caption" colorValue={cameraColors.textSecondary}>
                  “{phase.question}”
                </Text>
              )}
              <Text variant="bodyLarge" colorValue={cameraColors.text}>
                {phase.plain}
              </Text>
              {phase.response.citations.length > 0 && (
                <Text variant="caption" colorValue={cameraColors.textSecondary}>
                  {w.source(phase.response.citations.map((citation) => citation.title).join(", "))}
                </Text>
              )}
            </ScrollView>
            <View style={styles.row}>
              <GlassPill
                icon={speaking === phase.response.answer ? "stop" : "volume-high"}
                label={speaking === phase.response.answer ? m.common.stop : m.common.listen}
                spoken={speaking === phase.response.answer ? w.stopSpoken : w.readSpoken}
                onPress={() => (speaking === phase.response.answer ? stopAnswer() : void speakAnswer(phase.response.answer, phase.plain))}
              />
              <View style={styles.flex} />
              <GlassPill gold icon="camera" label={w.askAgain} spoken={w.askAgainSpoken} onPress={again} />
            </View>
          </View>
        )}

        {phase.kind === "failed" && (
          <View style={styles.card} accessibilityRole="alert">
            <Text colorValue={cameraColors.text}>{phase.message}</Text>
            <GlassPill gold icon="refresh" label={m.common.retry} onPress={again} />
          </View>
        )}

        {phase.kind === "aim" && (
          <View style={styles.controls}>
            <View style={styles.side} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={w.shoot}
              accessibilityState={{ disabled: !ready || listening }}
              disabled={!ready || listening}
              onPress={() => void capture(null)}
              style={({ pressed }) => [styles.shutter, (pressed || !ready) && styles.dim]}
            >
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={voice.phase === "recording" ? w.stopAndAsk : w.askByVoice}
              disabled={!ready || voice.phase === "transcribing"}
              onPress={voice.toggle}
              style={({ pressed }) => [styles.mic, voice.phase === "recording" && styles.micOn, pressed && styles.dim]}
            >
              {voice.phase === "transcribing" ? (
                <ActivityIndicator color={cameraColors.text} />
              ) : (
                <Ionicons name={voice.phase === "recording" ? "stop" : "mic"} size={24} color={voice.phase === "recording" ? cameraColors.onGold : cameraColors.text} />
              )}
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const SHUTTER = 76;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: cameraColors.background },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.lg },
  centerText: { textAlign: "center" },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.md },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, gap: spacing.md },
  hint: { backgroundColor: cameraGlass, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignSelf: "center" },
  card: { backgroundColor: cameraColors.panel, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  answerScroll: { maxHeight: 260 },
  answerContent: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  side: { width: touchTarget.min + 12 },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 4, borderColor: cameraColors.text, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: SHUTTER - 16, height: SHUTTER - 16, borderRadius: (SHUTTER - 16) / 2, backgroundColor: cameraColors.text },
  mic: { width: touchTarget.min + 12, height: touchTarget.min + 12, borderRadius: (touchTarget.min + 12) / 2, backgroundColor: cameraGlass, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  micOn: { backgroundColor: cameraColors.gold },
  dim: { opacity: 0.6 },
});
