import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FakePlayer } from "./mocks/expo-audio";

vi.mock("../src/audio/stand-ins", () => ({
  standInSounds: { sifahane: "sifahane.m4a", kervan: "kervan.m4a", medrese: "medrese.m4a", hamam: "hamam.m4a" },
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
const isRecording = (p: FakePlayer) => (p.source as { uri?: string }).uri?.startsWith("https://media.allbytech.com/sounds/");

describe("capsule player", () => {
  it("plays the recording, and starts the captions once it is audible", () => {
    player.playCapsule("hamam");
    expect(isRecording(last())).toBe(true);
    expect(player.getPlayerState()).toMatchObject({ type: "hamam", loading: true, source: null });

    last().emit(playing);
    expect(player.getPlayerState()).toMatchObject({ loading: false, source: "recording" });
  });

  it("does not take 'playing' before any sound is out for a start", () => {
    player.playCapsule("hamam");
    last().emit({ playing: true, isBuffering: false, currentTime: 0 });
    expect(player.getPlayerState()?.loading).toBe(true);
  });

  it("falls back to the stand-in when the recording fails, and skips the recording next time", () => {
    player.playCapsule("hamam");
    const recording = last();
    recording.emit({ playing: false, isBuffering: false, currentTime: 0, error: "404" });

    expect(last().source).toBe("hamam.m4a");
    expect(audio.log).toContainEqual(["remove", recording]);
    last().emit(playing);
    expect(player.getPlayerState()?.source).toBe("stand-in");

    player.playCapsule("hamam");
    expect(last().source).toBe("hamam.m4a");
  });

  it("falls back to the stand-in when the recording has not started in 4 seconds", () => {
    player.playCapsule("kervan");
    vi.advanceTimersByTime(4000);
    expect(last().source).toBe("kervan.m4a");
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
