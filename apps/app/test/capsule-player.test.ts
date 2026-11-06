import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FakePlayer } from "./mocks/expo-audio";

vi.mock("../src/audio/sounds", () => ({
  capsuleSounds: { hamam: "hamam.mp3", kervan: "han.mp3", medrese: "medrese.mp3" },
}));

const playing = { playing: true, isBuffering: false, currentTime: 0.2 };

let player: typeof import("../src/audio/capsule-player");
let audio: typeof import("./mocks/expo-audio");
let setAppState: (state: string) => void;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  audio = await import("./mocks/expo-audio");
  ({ setAppState } = await import("./mocks/react-native"));
  player = await import("../src/audio/capsule-player");
});

afterEach(() => {
  player.stopCapsule();
  vi.useRealTimers();
});

const last = (): FakePlayer => audio.players.at(-1)!;

describe("capsule player", () => {
  it("plays the recording, and starts the captions once it is audible", () => {
    player.playCapsule("hamam");
    expect(last().source).toBe("hamam.mp3");
    expect(player.getPlayerState()).toMatchObject({ type: "hamam", loading: true, audible: false });

    last().emit(playing);
    expect(player.getPlayerState()).toMatchObject({ loading: false, audible: true });
  });

  it("does not take 'playing' before any sound is out for a start", () => {
    player.playCapsule("hamam");
    last().emit({ playing: true, isBuffering: false, currentTime: 0 });
    expect(player.getPlayerState()?.loading).toBe(true);
  });

  it("runs silently when the sound fails", () => {
    player.playCapsule("hamam");
    const sound = last();
    sound.emit({ playing: false, isBuffering: false, currentTime: 0, error: "decode" });

    expect(audio.log).toContainEqual(["remove", sound]);
    expect(player.getPlayerState()).toMatchObject({ loading: false, audible: false });
  });

  it("runs silently when the sound has not started in 4 seconds", () => {
    player.playCapsule("kervan");
    vi.advanceTimersByTime(4000);
    expect(player.getPlayerState()).toMatchObject({ loading: false, audible: false });
  });

  it("rises from silence, loops a short file and sinks back at the end", () => {
    player.playCapsule("hamam");
    expect(last().volume).toBe(0);
    expect(last().loop).toBe(true);
    last().emit(playing);
    vi.advanceTimersByTime(1000);
    expect(last().volume).toBeCloseTo(0.5, 1);
    vi.advanceTimersByTime(9000);
    expect(last().volume).toBe(1);
    vi.advanceTimersByTime(13_000);
    expect(last().volume).toBeCloseTo(0.5, 1);
  });

  it("silences and brings back the sound at the same moment", () => {
    player.playCapsule("hamam");
    last().emit(playing);
    vi.advanceTimersByTime(10_000);
    player.setCapsuleMuted(true);
    expect(last().volume).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(last().volume).toBe(0);
    expect(player.getPlayerState()?.elapsed).toBeGreaterThan(10);
    player.setCapsuleMuted(false);
    expect(last().volume).toBe(1);
  });

  it("pauses before it removes, so a phone stops the sound at once", () => {
    player.playCapsule("hamam");
    const recording = last();
    recording.emit(playing);
    player.stopCapsule();

    const calls = audio.log.filter(([, p]) => p === recording).map(([call]) => call);
    expect(calls.slice(-2)).toEqual(["pause", "remove"]);
    expect(player.getPlayerState()).toBeNull();
  });

  it("plays one capsule at a time", () => {
    player.playCapsule("hamam");
    const first = last();
    first.emit(playing);
    player.playCapsule("medrese");

    expect(audio.log).toContainEqual(["remove", first]);
    expect(player.getPlayerState()?.type).toBe("medrese");
  });

  it("drops a late start of a capsule that was already replaced", () => {
    player.playCapsule("hamam");
    const first = last();
    player.playCapsule("medrese");
    first.emit(playing);
    expect(player.getPlayerState()).toMatchObject({ type: "medrese", loading: true });
  });

  it("toggles off the capsule that is playing", () => {
    player.toggleCapsule("hamam");
    player.toggleCapsule("hamam");
    expect(player.getPlayerState()).toBeNull();
  });

  it("stops when the app goes to the background, not for Control Center", () => {
    player.playCapsule("hamam");
    last().emit(playing);
    setAppState("inactive");
    expect(player.getPlayerState()).not.toBeNull();
    setAppState("background");
    expect(player.getPlayerState()).toBeNull();
  });

  it("stops by itself after 24 seconds", () => {
    player.playCapsule("hamam");
    last().emit(playing);
    vi.advanceTimersByTime(23_000);
    expect(player.getPlayerState()?.elapsed).toBeGreaterThan(22);
    vi.advanceTimersByTime(1_200);
    expect(player.getPlayerState()).toBeNull();
  });
});
