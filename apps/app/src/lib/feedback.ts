import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { AccessibilityInfo, Platform, Vibration } from "react-native";

import { getPlayerState } from "@/audio/capsule-player";
import { isSpeaking } from "@/lib/voice";

/**
 * Sound cues and haptics for the app's small moments of reward. Each cue repeats what the screen
 * and the screen reader already say, never carries it alone. The files are synthesized
 * (`npm run sounds`, scripts/make-sounds.py).
 *
 * Phones only: the web has no haptics, and its browsers block sound until a tap. "Ses efektleri"
 * and "Titreşim" on Sistem ayarları turn either off. A cue's sound waits out nothing and talks
 * over nothing: while a capsule plays or an answer is read aloud only its haptic comes.
 */
export type Cue = "sealFit" | "sealStamp" | "inscriptionFound" | "badge" | "fog" | "pageTurn" | "sticker" | "shutter";

/** A haptic on its own, for taps that make no sound. */
export type Haptic = "selection" | "light" | "medium" | "heavy" | "success" | "warning";

const sources: Record<Cue, number> = {
  sealFit: require("@/audio/cues/seal-fit.wav"),
  sealStamp: require("@/audio/cues/seal-stamp.wav"),
  inscriptionFound: require("@/audio/cues/inscription-found.wav"),
  badge: require("@/audio/cues/badge.wav"),
  fog: require("@/audio/cues/fog.wav"),
  pageTurn: require("@/audio/cues/page-turn.wav"),
  sticker: require("@/audio/cues/sticker.wav"),
  shutter: require("@/audio/cues/shutter.wav"),
};

/** Under the voice and the capsules: a cue is a touch, not a sound to listen to. */
const volume: Record<Cue, number> = {
  sealFit: 0.5,
  sealStamp: 0.9,
  inscriptionFound: 0.55,
  badge: 0.7,
  fog: 0.45,
  pageTurn: 0.5,
  sticker: 0.5,
  shutter: 1,
};

const haptics: Record<Cue, Haptic | "aligned" | null> = {
  sealFit: "aligned",
  sealStamp: "heavy",
  inscriptionFound: "light",
  badge: "success",
  // The fog is only watched: nothing was touched.
  fog: null,
  pageTurn: "light",
  sticker: "light",
  shutter: "medium",
};

/**
 * The least time between two plays of a cue: the seal's photo can slip in and out of line several
 * times a second in a trembling hand, and should not stutter.
 */
const cooldownMs: Partial<Record<Cue, number>> = { sealFit: 1500 };

const native = Platform.OS !== "web";
let options = { sound: true, haptics: true };
const players = new Map<Cue, AudioPlayer>();
const lastPlayed = new Map<Cue, number>();
/** Cues waiting for their file to load: a second call meanwhile does not wait twice. */
const waiting = new Set<Cue>();

// A screen reader speaks at the same moments the cues mark (a found inscription, a badge): the
// sound would cover its words, so with one on only the haptic comes.
let screenReader = false;
if (native) {
  AccessibilityInfo.isScreenReaderEnabled().then(
    (on) => (screenReader = on),
    () => {},
  );
  AccessibilityInfo.addEventListener("screenReaderChanged", (on) => (screenReader = on));
}

/** The two switches on Sistem ayarları; the settings provider keeps this in step with them. */
export function setFeedbackOptions(next: { sound: boolean; haptics: boolean }) {
  options = next;
}

function playerFor(cue: Cue): AudioPlayer {
  let player = players.get(cue);
  if (!player) {
    player = createAudioPlayer(sources[cue]);
    players.set(cue, player);
  }
  return player;
}

/** Loads every cue once, at start, so the first one plays without a pause. */
export function preloadCues() {
  if (!native) return;
  for (const cue of Object.keys(sources) as Cue[]) {
    try {
      playerFor(cue);
    } catch {
      // Played without the head start, or not at all.
    }
  }
}

/** A capsule or a reading is sounding: a cue would talk over it. */
function voiceSounding(): boolean {
  const capsule = getPlayerState();
  return isSpeaking() || (capsule !== null && capsule.audible && !capsule.muted);
}

/**
 * On Android expo-haptics plays at a fraction of the motor's strength (a selection at about an
 * eighth), too faint to feel on many phones: there the system's own vibration runs at full
 * strength, as short pulses (ms; a pattern starts with a wait).
 */
const androidPulses: Record<Haptic | "aligned", number | number[]> = {
  // Under about 25 ms many phones' motors do not get going: felt as nothing.
  selection: 30,
  light: 30,
  medium: 35,
  heavy: 60,
  aligned: [0, 35, 70, 35],
  success: [0, 30, 60, 45],
  warning: [0, 40, 60, 40, 60, 40],
};

/** A haptic, unless "Titreşim" is off. */
export function haptic(kind: Haptic | "aligned") {
  if (!native || !options.haptics) return;
  if (Platform.OS === "android") {
    Vibration.vibrate(androidPulses[kind]);
    return;
  }
  switch (kind) {
    case "selection":
      void Haptics.selectionAsync().catch(() => {});
      return;
    case "aligned":
    case "success":
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    case "warning":
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    case "light":
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    case "medium":
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      return;
    case "heavy":
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      return;
  }
}

/** How long a cue waits for its file to load; later than that it would be out of its moment. */
const LOAD_WAIT_MS = 600;

function start(player: AudioPlayer) {
  // Played before: from the start again.
  if (player.currentTime > 0) void player.seekTo(0).then(() => player.play(), () => {});
  else player.play();
}

/** The cue's haptic, and its sound unless "Ses efektleri" is off or a voice is sounding. */
export function cue(name: Cue) {
  if (!native) return;
  const now = Date.now();
  const gap = cooldownMs[name];
  if (gap && now - (lastPlayed.get(name) ?? 0) < gap) return;
  lastPlayed.set(name, now);
  const touch = haptics[name];
  if (touch) haptic(touch);
  if (!options.sound || screenReader || voiceSounding()) return;
  try {
    const player = playerFor(name);
    player.volume = volume[name];
    if (player.isLoaded) {
      start(player);
      return;
    }
    // Not loaded yet (the first cue soon after start): played once it is, if still in its moment.
    // One wait at a time, and none longer than its moment, even if the file never loads.
    if (waiting.has(name)) return;
    waiting.add(name);
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.isLoaded) return;
      done();
      start(player);
    });
    const done = () => {
      clearTimeout(timer);
      subscription.remove();
      waiting.delete(name);
    };
    const timer = setTimeout(done, LOAD_WAIT_MS);
  } catch (error) {
    // A sound that cannot play is only a sound: the moment is shown and said all the same.
    if (__DEV__) console.warn(`[cue] ${name}: could not play`, error);
  }
}
