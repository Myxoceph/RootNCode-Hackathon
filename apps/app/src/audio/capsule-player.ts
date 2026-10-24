import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from "expo-audio";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { CAPSULE_SECONDS, capsules, type CapsuleType } from "@/content/capsules";

import { isMissing, markMissing, recordingUrl } from "./sounds";
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
  /** The sound is starting; captions start with it. */
  loading: boolean;
}

/** How long a file may take to start playing before the next sound is tried. */
const START_TIMEOUT_MS = 4000;

let state: PlayerState | null = null;
let synth: SynthHandle | null = null;
let audio: AudioPlayer | null = null;
/** Stops waiting for the current file to start. */
let cancelStart: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** Bumped on every start and stop, so callbacks of an earlier start are dropped. */
let run = 0;
let audioModeReady = false;
const listeners = new Set<() => void>();

/**
 * iOS: play with the ring/silent switch on silent, like any media the visitor starts. A capsule
 * belongs to the screen: never play on in the background. Set when the module loads, so it is
 * in place before the first tap; retried on the next play if it failed.
 */
function setAudioMode() {
  if (audioModeReady) return;
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).then(
    () => (audioModeReady = true),
    () => {},
  );
}
setAudioMode();

function emit() {
  listeners.forEach((listener) => listener());
}

function release(player: AudioPlayer) {
  // `remove` alone releases the player later on phones, so the sound would run on: pause first.
  player.pause();
  player.remove();
}

export function stopCapsule() {
  run++;
  cancelStart?.();
  cancelStart = null;
  if (timer) clearInterval(timer);
  timer = null;
  synth?.stop();
  synth = null;
  if (audio) release(audio);
  audio = null;
  state = null;
  emit();
}

/**
 * Starts in the tap itself (Safari lets audio start only there): the recording first; if it
 * fails or does not start in time, the stand-in. The captions start with the sound.
 */
export function playCapsule(type: CapsuleType) {
  stopCapsule();
  unlockAudio();
  setAudioMode();
  const id = run;
  state = { type, elapsed: 0, source: null, loading: true };
  emit();

  const key = capsules[type].soundKey;
  if (isMissing(key)) playStandIn(id, type);
  else
    playFile(id, type, { uri: recordingUrl(key) }, "recording", () => {
      markMissing(key);
      playStandIn(id, type);
    });
}

function playStandIn(id: number, type: CapsuleType) {
  if (standInSounds) {
    playFile(id, type, standInSounds[type], "stand-in", () => begin(id, type, null));
    return;
  }
  synth = startSynth(type);
  begin(id, type, synth ? "stand-in" : null);
}

/** Plays `file`; `begin`s once it is audible, or calls `onFail` on an error or a timeout. */
function playFile(id: number, type: CapsuleType, file: AudioSource, source: CapsuleSource, onFail: () => void) {
  let player: AudioPlayer;
  try {
    player = createAudioPlayer(file);
  } catch {
    onFail();
    return;
  }
  audio = player;
  const sub = player.addListener("playbackStatusUpdate", (status) => {
    if (status.error) fail();
    // `playing` alone is not enough: the web reports it on `play()`, before the file has loaded.
    else if (status.playing && !status.isBuffering && status.currentTime > 0) {
      done();
      begin(id, type, source);
    }
  });
  const timeout = setTimeout(fail, START_TIMEOUT_MS);
  function done() {
    clearTimeout(timeout);
    sub.remove();
    if (cancelStart === done) cancelStart = null;
  }
  function fail() {
    done();
    if (id !== run) return;
    release(player);
    if (audio === player) audio = null;
    onFail();
  }
  cancelStart = done;
  player.play();
}

function begin(id: number, type: CapsuleType, source: CapsuleSource) {
  if (id !== run) return;
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
// Only "background": iOS is briefly "inactive" for Control Center or a system dialog.
AppState.addEventListener("change", (next) => {
  if (next === "background" && state) stopCapsule();
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
