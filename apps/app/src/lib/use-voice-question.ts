import { VOICE_MAX_SECONDS } from "@vagabonds/contracts";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useEffect, useRef, useState } from "react";

import { DataError } from "@/data/errors";
import { transcribe } from "@/data/voice";
import { announce } from "@/lib/announce";
import { stopAnswer } from "@/lib/voice";

export type VoicePhase = "idle" | "recording" | "transcribing";

export interface VoiceQuestion {
  phase: VoicePhase;
  /** Loudness while recording, 0 (silence) to 1, for the level bars. */
  level: number;
  /** Seconds recorded so far. */
  seconds: number;
  /** Starts listening, or, while listening, stops and sends what was said. */
  toggle: () => void;
}

const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

/**
 * A spoken question for Rehber: one tap starts recording, a second (or `VOICE_MAX_SECONDS`)
 * stops it; the recording becomes text (`POST /voice/transcribe`) and goes to `onQuestion`.
 * Whatever is being read aloud stops when listening starts. Problems go to `onError` as a
 * sentence to show; leaving the screen drops a recording on its way.
 */
export function useVoiceQuestion(onQuestion: (text: string) => void, onError: (message: string) => void): VoiceQuestion {
  const recorder = useAudioRecorder(RECORDING);
  const status = useAudioRecorderState(recorder, 100);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const phaseRef = useRef<VoicePhase>("idle");
  const limit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);
  // The latest callbacks, for a recording that ends on the timer.
  const handlers = useRef({ onQuestion, onError });
  handlers.current = { onQuestion, onError };

  const go = (next: VoicePhase) => {
    phaseRef.current = next;
    if (mounted.current) setPhase(next);
  };

  async function start() {
    stopAnswer();
    const permission = await requestRecordingPermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      handlers.current.onError("Mikrofon izni verilmedi. Telefonun ayarlarından izin verebilir ya da yazarak sorabilirsin.");
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      handlers.current.onError("Mikrofon açılamadı. Yazarak sorabilirsin.");
      return;
    }
    go("recording");
    announce("Dinliyorum. Bitirince tekrar dokun.");
    limit.current = setTimeout(() => void finish(), VOICE_MAX_SECONDS * 1000);
  }

  async function finish() {
    if (phaseRef.current !== "recording") return;
    clearTimeout(limit.current);
    go("transcribing");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (!mounted.current || !recorder.uri) return;
      const text = await transcribe(recorder.uri);
      if (!mounted.current) return;
      if (text.length === 0) handlers.current.onError("Söylediğini anlayamadım. Biraz daha yakından ve yavaş tekrar dene.");
      else handlers.current.onQuestion(text);
    } catch (error) {
      if (mounted.current) handlers.current.onError(error instanceof DataError ? error.message : "Sesli soru gönderilemedi. Yazarak sorabilirsin.");
    } finally {
      go("idle");
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(limit.current);
      if (phaseRef.current === "recording") void recorder.stop().catch(() => {});
    };
  }, [recorder]);

  // Metering is in dBFS: about -60 is a quiet room, 0 the loudest.
  const db = status.metering ?? -160;
  return {
    phase,
    level: phase === "recording" ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0,
    seconds: phase === "recording" ? Math.floor(status.durationMillis / 1000) : 0,
    toggle: () => {
      if (phaseRef.current === "idle") void start();
      else if (phaseRef.current === "recording") void finish();
    },
  };
}
