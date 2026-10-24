import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from "expo-audio";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { CAPSULE_SECONDS, capsules, type CapsuleType } from "@/content/capsules";

import { hasRecording, recordingUrl } from "./sounds";
import { standInSounds } from "./stand-ins";
import { startSynth, unlockAudio, type SynthHandle } from "./synth";

/**
 * Where the sound comes from: the CC0 recording (H9), else a stand-in, the
 * synthesized ambience (live on the web, recorded on phones; see ./stand-ins.ts).
 * `null`: no sound could start; the captions still run.
 */
export type CapsuleSource = "recording" | "stand-in" | null;

/**
 * One capsule plays at a time, app-wide: the Kapsül tab and the mini player on
 * a monument card share this player, so starting one stops the other.
 */
export interface PlayerState {
  type: CapsuleType;
  elapsed: number;
  source: CapsuleSource;
  /** The sound is being looked up; captions start with it. */
  loading: boolean;
}

let state: PlayerState | null = null;
let synth: SynthHandle | null = null;
let audio: AudioPlayer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** Bumped on every start and stop, so a lookup that finishes late is dropped. */
let run = 0;
let audioModeSet = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function stopCapsule() {
  run++;
  if (timer) clearInterval(timer);
  timer = null;
  synth?.stop();
  synth = null;
  if (audio) {
    // `remove` alone releases the player later on phones, so the sound would run on: pause first.
    audio.pause();
    audio.remove();
  }
  audio = null;
  state = null;
  emit();
}

export function playCapsule(type: CapsuleType) {
  stopCapsule();
  unlockAudio();
  const id = run;
  state = { type, elapsed: 0, source: null, loading: true };
  emit();
  void findSound(type).then((sound) => {
    if (id !== run) return; // Stopped, or another capsule started, while the sound was looked up.
    const source = startSound(type, sound);
    const startedAt = Date.now();
    state = { type, elapsed: 0, source, loading: false };
    timer = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed >= CAPSULE_SECONDS || !state) {
        stopCapsule();
        return;
      }
      state = { ...state, elapsed };
      emit();
    }, 200);
    emit();
  });
}

/** The recording if it is in the bucket, else the stand-in file; `null`: synthesize. */
async function findSound(type: CapsuleType): Promise<{ file: AudioSource; source: CapsuleSource } | null> {
  const key = capsules[type].soundKey;
  if (await hasRecording(key)) return { file: { uri: recordingUrl(key) }, source: "recording" };
  return standInSounds ? { file: standInSounds[type], source: "stand-in" } : null;
}

/** Starts the sound right away (no await), so a newer start cannot slip in between. */
function startSound(type: CapsuleType, sound: { file: AudioSource; source: CapsuleSource } | null): CapsuleSource {
  if (!sound) {
    synth = startSynth(type);
    return synth ? "stand-in" : null;
  }
  return playFile(sound.file) ? sound.source : null;
}

function playFile(source: AudioSource): boolean {
  try {
    if (!audioModeSet) {
      // iOS: play with the ring/silent switch on silent, like any media the visitor starts.
      // A capsule belongs to the screen: never play on in the background.
      void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      audioModeSet = true;
    }
    audio = createAudioPlayer(source);
    audio.play();
    return true;
  } catch {
    return false;
  }
}

export function toggleCapsule(type: CapsuleType) {
  if (state?.type === type) stopCapsule();
  else playCapsule(type);
}

/** Frequency data for the visualizer, while the web synthesizes; leaves `into` untouched otherwise. */
export function readFrequencies(into: Uint8Array<ArrayBuffer>) {
  synth?.readFrequencies(into);
}

/** Whether `readFrequencies` has anything to read. */
export function hasFrequencies(): boolean {
  return synth !== null;
}

// Leaving the app stops the capsule (Expo Go ignores app.json's `enableBackgroundPlayback`).
AppState.addEventListener("change", (next) => {
  if (next !== "active" && state) stopCapsule();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCapsulePlayer(): PlayerState | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}
