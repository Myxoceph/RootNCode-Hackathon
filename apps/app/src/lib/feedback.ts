import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";

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
export type Cue = "sealFit" | "sealStamp" | "inscriptionFound" | "badge";

/** A haptic on its own, for taps that make no sound. */
export type Haptic = "light" | "medium" | "heavy" | "success" | "warning";

const sources: Record<Cue, number> = {
  sealFit: require("@/audio/cues/seal-fit.wav"),
  sealStamp: require("@/audio/cues/seal-stamp.wav"),
  inscriptionFound: require("@/audio/cues/inscription-found.wav"),
  badge: require("@/audio/cues/badge.wav"),
};

/** Under the voice and the capsules: a cue is a touch, not a sound to listen to. */
const volume: Record<Cue, number> = {
  sealFit: 0.5,
  sealStamp: 0.9,
  inscriptionFound: 0.55,
  badge: 0.7,
};

const haptics: Record<Cue, Haptic | "aligned"> = {
  sealFit: "aligned",
  sealStamp: "heavy",
  inscriptionFound: "light",
  badge: "success",
};

const native = Platform.OS !== "web";
let options = { sound: true, haptics: true };
const players = new Map<Cue, AudioPlayer>();

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

/** A haptic, unless "Titreşim" is off. */
export function haptic(kind: Haptic | "aligned") {
  if (!native || !options.haptics) return;
  switch (kind) {
    case "aligned":
      // On Android expo-haptics plays at a fraction of the motor's strength, too faint on many
      // phones: the system's own vibration runs at full strength.
      if (Platform.OS === "android") Vibration.vibrate([0, 35, 70, 35]);
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
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
  haptic(haptics[name]);
  if (!options.sound) return;
  if (voiceSounding()) {
    if (__DEV__) console.info(`[cue] ${name}: kept quiet, a capsule or a reading is sounding`);
    return;
  }
  try {
    const player = playerFor(name);
    player.volume = volume[name];
    if (player.isLoaded) {
      start(player);
      return;
    }
    // Not loaded yet (the first cue soon after start): played once it is, if still in its moment.
    const asked = Date.now();
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.isLoaded) return;
      subscription.remove();
      if (Date.now() - asked <= LOAD_WAIT_MS) start(player);
      else if (__DEV__) console.info(`[cue] ${name}: loaded too late, skipped`);
    });
  } catch (error) {
    // A sound that cannot play is only a sound: the moment is shown and said all the same.
    if (__DEV__) console.warn(`[cue] ${name}: could not play`, error);
  }
}
