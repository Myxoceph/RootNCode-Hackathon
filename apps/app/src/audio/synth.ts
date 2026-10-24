import type { CapsuleType } from "@/content/capsules";

export interface SynthHandle {
  stop: () => void;
  readFrequencies: (into: Uint8Array<ArrayBuffer>) => void;
}

/**
 * Native has no Web Audio, and the recordings are not in yet (task H9), so
 * capsules run silently on phones: the timer and captions still play.
 * The web build uses `synth.web.ts` instead.
 */
export function startSynth(_type: CapsuleType): SynthHandle | null {
  return null;
}

/** Only the web's engine needs opening inside a tap. */
export function unlockAudio() {}
