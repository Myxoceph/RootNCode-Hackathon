import Ionicons from "@expo/vector-icons/Ionicons";
import type { VisionAskResponse } from "@vagabonds/contracts";
import { cameraColors, cameraGlass, radius, spacing, Text, touchTarget } from "@vagabonds/ui";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassPill } from "@/components/camera-chrome";
import { DataError } from "@/data/errors";
import { askStone } from "@/data/vision";
import { useMessages } from "@/i18n";
import { announce } from "@/lib/announce";
import { answerParts } from "@/lib/chat";
import { useVoiceQuestion } from "@/lib/use-voice-question";
import { speakAnswer, stopAnswer, stopAnswerOf, useSpeaking } from "@/lib/voice";

type Phase =
  | { kind: "aim" }
  | { kind: "looking"; photo: string; question: string | null }
  | { kind: "answered"; photo: string; question: string | null; response: VisionAskResponse; plain: string }
  | { kind: "failed"; photo: string | null; message: string };

export interface AskPanelProps {
  /** The asset the photo is taken at: its record grounds the answer. Null: the photo alone. */
  assetId: string | null;
  /** Takes the photo, a JPEG file's uri: from the phone's camera, or the frame the tracker froze. */
  takePhoto: () => Promise<string>;
  /** The camera can take a photo. */
  ready: boolean;
  /** Asked when the visitor only presses the shutter; without it the API's own ("Bu ne?"). */
  defaultQuestion?: string;
  /** Lays the photo taken over the camera; off when the camera's own picture already stands still. */
  showPhoto: boolean;
  /** The camera runs again, for another photo. */
  onAgain?: () => void;
  /** A way out of asking, e.g. back to looking for inscriptions. */
  back?: { label: string; onPress: () => void };
}

/**
 * Asking the assistant about what the camera shows (Taşa Sor): the shutter asks the default
 * question, the microphone a spoken one. The answer, from the photo and the asset's record,
 * appears over the bottom of the camera and is read aloud. Photos are not stored.
 * Over the whole screen, the camera under it.
 */
export function AskPanel({ assetId, takePhoto, ready, defaultQuestion, showPhoto, onAgain, back }: AskPanelProps) {
  const m = useMessages();
  const w = m.stone;
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ kind: "aim" });
  const shown = useRef(true);
  // A photo on its way: a second tap or spoken question waits for this one's answer.
  const busy = useRef(false);
  const speaking = useSpeaking();
  // The answers this panel read aloud; leaving it ends them, not another screen's reading.
  const mine = useRef(new Set<string>());

  useEffect(() => {
    shown.current = true;
    const own = mine.current;
    return () => {
      shown.current = false;
      stopAnswerOf((key) => own.has(key));
    };
  }, []);

  async function capture(question: string | null) {
    if (busy.current || phase.kind === "looking" || !ready) return;
    busy.current = true;
    try {
      await ask(question);
    } finally {
      busy.current = false;
    }
  }

  async function ask(question: string | null) {
    stopAnswer();
    let photo: string;
    try {
      photo = await takePhoto();
    } catch {
      if (shown.current) setPhase({ kind: "failed", photo: null, message: w.photoFailed });
      return;
    }
    if (!shown.current) return;
    setPhase({ kind: "looking", photo, question });
    announce(w.lookingSaid);
    try {
      const response = await askStone(photo, assetId, question ?? defaultQuestion);
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
    onAgain?.();
  }

  const photo = showPhoto && phase.kind !== "aim" ? phase.photo : null;
  const listening = voice.phase !== "idle";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {photo && <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={w.yourPhoto} />}

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
            {back ? (
              <Pressable accessibilityRole="button" accessibilityLabel={back.label} onPress={back.onPress} style={({ pressed }) => [styles.side, styles.sideButton, pressed && styles.dim]}>
                <Ionicons name="scan" size={22} color={cameraColors.text} />
              </Pressable>
            ) : (
              <View style={styles.side} />
            )}
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
const SIDE = touchTarget.min + 12;

const styles = StyleSheet.create({
  centerText: { textAlign: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, gap: spacing.md },
  hint: { backgroundColor: cameraGlass, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignSelf: "center" },
  card: { backgroundColor: cameraColors.panel, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  answerScroll: { maxHeight: 260 },
  answerContent: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
  side: { width: SIDE, height: SIDE },
  sideButton: { borderRadius: SIDE / 2, backgroundColor: cameraGlass, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 4, borderColor: cameraColors.text, alignItems: "center", justifyContent: "center" },
  shutterInner: { width: SHUTTER - 16, height: SHUTTER - 16, borderRadius: (SHUTTER - 16) / 2, backgroundColor: cameraColors.text },
  mic: { width: SIDE, height: SIDE, borderRadius: SIDE / 2, backgroundColor: cameraGlass, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  micOn: { backgroundColor: cameraColors.gold },
  dim: { opacity: 0.6 },
});
