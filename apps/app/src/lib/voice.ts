import { VOICE_SPEECH_MAX_CHARS } from "@vagabonds/contracts";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from "expo-audio";
import * as Speech from "expo-speech";
import { useSyncExternalStore } from "react";

import { speechSource } from "@/data/voice";

/**
 * Reads Rehber's answers aloud in EVREN's voice (`GET /voice/speech`), one answer at a time.
 * The first sentence is asked for on its own, so it plays within a second or two while the rest
 * is prepared. Should the voice fail, the rest is read by the phone's own voice (expo-speech).
 */

/** A first sentence shorter than this ("Evet.") goes with the next, so the first part is worth the wait. */
const FIRST_MIN_CHARS = 40;
/** A part that has not started playing by then is read by the phone's voice instead. */
const START_TIMEOUT_MS = 8_000;

/**
 * A piece that ends in an abbreviation ("H.", "M.S.", "Hz.") or a Roman ordinal ("II." of
 * "II. Murad") goes on into the next.
 */
const ABBREVIATION_END = /(?:^|[\s("“'])(?:H|M|Hz|M\.S|M\.Ö|Dr|Prof|St|vb|vs|yy|[IVXL]+)\.$/;

/**
 * The answer in parts to read: the first sentence (or two, if short), then the rest in pieces the
 * API takes (`VOICE_SPEECH_MAX_CHARS`). `text` is plain, without `[n]` markers.
 */
export function speechParts(text: string): string[] {
  const sentences: string[] = [];
  // A sentence ends where the next starts with a capital letter or a number; a period inside one,
  // as in "15. yüzyıl", or after an abbreviation, as in "H. 802" or "Hz. Ali", does not end it.
  for (const piece of text.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9"“'(])/)) {
    const previous = sentences.at(-1);
    if (previous !== undefined && ABBREVIATION_END.test(previous)) sentences[sentences.length - 1] = `${previous} ${piece}`;
    else if (piece) sentences.push(piece);
  }
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    const firstDone = parts.length > 0 || current.length >= FIRST_MIN_CHARS;
    if (current && (next.length > VOICE_SPEECH_MAX_CHARS || (parts.length === 0 && firstDone))) {
      parts.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  // A sentence longer than the API takes is cut at a word.
  return parts.flatMap((part) => {
    const pieces: string[] = [];
    let rest = part;
    while (rest.length > VOICE_SPEECH_MAX_CHARS) {
      const cut = rest.lastIndexOf(" ", VOICE_SPEECH_MAX_CHARS);
      pieces.push(rest.slice(0, cut > 0 ? cut : VOICE_SPEECH_MAX_CHARS));
      rest = rest.slice(cut > 0 ? cut + 1 : VOICE_SPEECH_MAX_CHARS);
    }
    return rest ? [...pieces, rest] : pieces;
  });
}

let playing: string | null = null;
let run = 0;
let player: AudioPlayer | null = null;
/** Ends the part being played, so the reading it belongs to goes on and sees it was stopped. */
let endPart: (() => void) | null = null;
const listeners = new Set<() => void>();

function set(key: string | null) {
  playing = key;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The key of the answer being read aloud, or `null`; for the "Dinle / Durdur" buttons. */
export function useSpeaking(): string | null {
  return useSyncExternalStore(subscribe, () => playing, () => playing);
}

/** Stops a player at once: on Android `remove()` alone can leave the sound playing. */
function silence(part: AudioPlayer) {
  try {
    part.pause();
  } catch {
    // Already released.
  }
  part.remove();
}

/** Stops whatever is being read, in either voice. */
export function stopAnswer() {
  run += 1;
  endPart?.();
  if (player) silence(player);
  player = null;
  Speech.stop();
  if (playing !== null) set(null);
}

/** Plays one part to its end; false when it failed or did not start in time. */
function playPart(source: AudioSource, current: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (!current()) return resolve(true);
    const part = createAudioPlayer(source);
    player = part;
    let started = false;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (endPart === end) endPart = null;
      clearTimeout(timer);
      subscription.remove();
      if (player === part) {
        silence(part);
        player = null;
      }
      resolve(ok);
    };
    const end = () => finish(true);
    endPart = end;
    const timer = setTimeout(() => !started && finish(false), START_TIMEOUT_MS);
    const subscription = part.addListener("playbackStatusUpdate", (status) => {
      if (status.playing) started = true;
      // A refused or failed download (no account, voice off) shows only in the state's name.
      if (/error|fail/i.test(status.playbackState)) finish(false);
      else if (status.didJustFinish) finish(true);
      else if (!current()) finish(true);
    });
    part.play();
  });
}

/** A browser's downloaded speech is let go once played (or not needed): it stays in memory otherwise. */
function release(source: AudioSource | null) {
  const uri = typeof source === "object" && source !== null && "uri" in source ? source.uri : undefined;
  if (typeof uri === "string" && uri.startsWith("blob:")) URL.revokeObjectURL(uri);
}

/** The phone's own voice, for what EVREN's could not read. */
function speakOnDevice(text: string, current: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (!current()) return resolve();
    Speech.speak(text, { language: "tr-TR", rate: 0.95, onDone: resolve, onStopped: resolve, onError: () => resolve() });
  });
}

/**
 * Reads `text` aloud as the answer `key`, stopping whatever was being read. Resolves when it is
 * done or stopped. The next part is asked for while one plays.
 */
export async function speakAnswer(key: string, text: string): Promise<void> {
  stopAnswer();
  const mine = ++run;
  const current = () => run === mine;
  set(key);
  const parts = speechParts(text);
  // Out of the recording mode: on iOS it would play from the earpiece, quietly.
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  let next: Promise<AudioSource | null> | null = parts.length > 0 ? speechSource(parts[0]!).catch(() => null) : null;
  for (let i = 0; i < parts.length && current(); i++) {
    const source = await next;
    next = i + 1 < parts.length ? speechSource(parts[i + 1]!).catch(() => null) : null;
    const ok = source !== null && (await playPart(source, current));
    release(source);
    if (!ok) {
      await speakOnDevice(parts.slice(i).join(" "), current);
      break;
    }
  }
  // A part asked for ahead and never played.
  void next?.then(release);
  if (current()) set(null);
}
