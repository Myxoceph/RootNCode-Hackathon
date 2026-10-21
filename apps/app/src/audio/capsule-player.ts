import { useSyncExternalStore } from "react";

import { CAPSULE_SECONDS, type CapsuleType } from "@/content/capsules";

import { startSynth, type SynthHandle } from "./synth";

/**
 * One capsule plays at a time, app-wide: the Kapsül tab and the mini player on
 * a monument card share this player, so starting one stops the other.
 */
export interface PlayerState {
  type: CapsuleType;
  elapsed: number;
  /** `false` on phones until the recordings arrive: captions run, no sound. */
  audible: boolean;
}

let state: PlayerState | null = null;
let synth: SynthHandle | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function stopCapsule() {
  if (timer) clearInterval(timer);
  timer = null;
  synth?.stop();
  synth = null;
  state = null;
  emit();
}

export function playCapsule(type: CapsuleType) {
  stopCapsule();
  synth = startSynth(type);
  startedAt = Date.now();
  state = { type, elapsed: 0, audible: synth !== null };
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

/** Frequency data for the visualizer; leaves `into` untouched when silent. */
export function readFrequencies(into: Uint8Array<ArrayBuffer>) {
  synth?.readFrequencies(into);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCapsulePlayer(): PlayerState | null {
  return useSyncExternalStore(subscribe, () => state, () => null);
}
