/** expo-audio players that record what was done to them; tests drive their status by hand. */
export interface AudioStatus {
  playing: boolean;
  isBuffering: boolean;
  currentTime: number;
  error?: string;
}

export class FakePlayer {
  readonly listeners = new Set<(status: AudioStatus) => void>();

  constructor(readonly source: unknown) {}

  play() {
    log.push(["play", this]);
  }
  pause() {
    log.push(["pause", this]);
  }
  remove() {
    log.push(["remove", this]);
  }
  addListener(_event: "playbackStatusUpdate", listener: (status: AudioStatus) => void) {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }
  /** Reports a playback status, as the native player would. */
  emit(status: AudioStatus) {
    this.listeners.forEach((listener) => listener(status));
  }
}

export const players: FakePlayer[] = [];
/** Every call on every player, in order. */
export const log: Array<["play" | "pause" | "remove", FakePlayer]> = [];

export function createAudioPlayer(source: unknown) {
  const player = new FakePlayer(source);
  players.push(player);
  return player;
}

export async function setAudioModeAsync() {}
