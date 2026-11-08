import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

import { CAPSULE_SECONDS, type CapsuleType } from "@/content/capsules";

import { capsuleSounds } from "./sounds";

/**
 * One capsule plays at a time, app-wide: the Kapsül tab and the mini player on
 * a monument card share this player, so starting one stops the other.
 */
export interface PlayerState {
  type: CapsuleType;
  elapsed: number;
  /** The sound is playing; false when it could not start, and the captions run on without it. */
  audible: boolean;
  /** The sound is starting; captions start with it. */
  loading: boolean;
  /** Silenced by the visitor; the capsule runs on, so the sound can come back at the same moment. */
  muted: boolean;
}

/** How long the sound may take to start playing before the capsule runs on without it. */
const START_TIMEOUT_MS = 4000;
/** The sound rises from silence and sinks back into it, whatever the file itself does. */
const FADE_SECONDS = 2;
/**
 * iOS: expo-audio closes the audio session 100 ms after a pause unless a player is already sounding. A
 * sound started inside that time is still loading, so the session goes from under it: it waits this long.
 */
const SESSION_SETTLE_MS = 150;

/** How loud the capsule is at a moment of its length, 0 to 1. */
export function capsuleGain(seconds: number): number {
  return Math.max(0, Math.min(1, seconds / FADE_SECONDS, (CAPSULE_SECONDS - seconds) / FADE_SECONDS));
}

let state: PlayerState | null = null;
let audio: AudioPlayer | null = null;
/** Stops waiting for the current file to start. */
let cancelStart: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
/** Bumped on every start and stop, so callbacks of an earlier start are dropped. */
let run = 0;
let audioModeReady = false;
/** When a player was last paused for good. */
let releasedAt = 0;
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
  releasedAt = Date.now();
}

export function stopCapsule() {
  run++;
  cancelStart?.();
  cancelStart = null;
  if (timer) clearInterval(timer);
  timer = null;
  if (audio) release(audio);
  audio = null;
  state = null;
  emit();
}

/**
 * Starts in the tap itself (Safari lets audio start only there). If the sound fails or does
 * not start in time, the capsule runs silently, captions only. The captions start with the sound.
 */
export function playCapsule(type: CapsuleType) {
  stopCapsule();
  setAudioMode();
  const id = run;
  state = { type, elapsed: 0, audible: false, loading: true, muted: false };
  emit();

  const settle = Platform.OS === "ios" ? SESSION_SETTLE_MS - (Date.now() - releasedAt) : 0;
  if (settle <= 0) {
    startSound(id, type);
    return;
  }
  const wait = setTimeout(() => {
    cancelStart = null;
    startSound(id, type);
  }, settle);
  cancelStart = () => clearTimeout(wait);
}

/** `begin`s once the sound is audible, or without it on an error or a timeout. */
function startSound(id: number, type: CapsuleType) {
  let player: AudioPlayer;
  try {
    player = createAudioPlayer(capsuleSounds[type]);
  } catch {
    begin(id, type, false);
    return;
  }
  audio = player;
  // A file shorter than the capsule starts again; a longer one is cut by the fade at the end.
  player.loop = true;
  player.volume = 0;
  const sub = player.addListener("playbackStatusUpdate", (status) => {
    if (status.error) fail();
    // `playing` alone is not enough: the web reports it on `play()`, before the file has loaded.
    else if (status.playing && !status.isBuffering && status.currentTime > 0) {
      done();
      begin(id, type, true);
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
    begin(id, type, false);
  }
  cancelStart = done;
  player.play();
}

function begin(id: number, type: CapsuleType, audible: boolean) {
  if (id !== run) return;
  const startedAt = Date.now();
  state = { type, elapsed: 0, audible, loading: false, muted: state?.muted ?? false };
  timer = setInterval(() => {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed >= CAPSULE_SECONDS || !state) {
      stopCapsule();
      return;
    }
    state = { ...state, elapsed };
    setVolume();
    emit();
  }, 200);
  emit();
}

export function toggleCapsule(type: CapsuleType) {
  if (state?.type === type) stopCapsule();
  else playCapsule(type);
}

function setVolume() {
  if (audio && state) audio.volume = state.muted ? 0 : capsuleGain(state.elapsed);
}

/** Silences the capsule or brings its sound back, at the same moment. */
export function setCapsuleMuted(muted: boolean) {
  if (!state) return;
  state = { ...state, muted };
  setVolume();
  emit();
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

/** The player as it is now, outside React (tests). */
export function getPlayerState(): PlayerState | null {
  return state;
}

export function useCapsulePlayer(): PlayerState | null {
  return useSyncExternalStore(subscribe, getPlayerState, () => null);
}
