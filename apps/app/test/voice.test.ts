import { VOICE_SPEECH_MAX_CHARS } from "@vagabonds/contracts";
import { describe, expect, it, vi } from "vitest";

/** A player that starts and never finishes on its own, as one cut off mid-sentence. */
const players: Array<{ removed: boolean; paused: boolean; released: boolean }> = [];
vi.mock("expo-audio", () => ({
  createAudioPlayer: vi.fn(() => {
    const player = {
      removed: false,
      addListener: (_event: string, listener: (status: object) => void) => {
        queueMicrotask(() => listener({ playing: true, playbackState: "playing", didJustFinish: false }));
        return { remove: vi.fn() };
      },
      play: vi.fn(),
      paused: false,
      released: false,
      pause: () => {
        if (player.released) throw new Error("released");
        player.paused = true;
      },
      remove: () => {
        if (player.released) throw new Error("released");
        player.removed = true;
      },
    };
    players.push(player);
    return player;
  }),
  setAudioModeAsync: vi.fn(async () => {}),
}));
vi.mock("expo-speech", () => ({ speak: vi.fn(), stop: vi.fn() }));
vi.mock("../src/data/voice", () => ({ speechSource: vi.fn(async (text: string) => ({ uri: `https://api.test/voice/speech?text=${text}` })) }));

const { speakAnswer, speechParts, stopAnswer, stopAnswerOf } = await import("../src/lib/voice");

describe("speakAnswer", () => {
  it("still ends when the player was already released", async () => {
    const reading = speakAnswer("salınmış", "Bir cümle burada duruyor ve biraz da uzun olsun.");
    await vi.waitFor(() => expect(players.length).toBeGreaterThan(0));
    players.at(-1)!.released = true;
    expect(() => stopAnswer()).not.toThrow();
    await expect(reading).resolves.toBeUndefined();
    players.length = 0;
  });

  it("stops only a reading its owner claims", async () => {
    const reading = speakAnswer("description:a", "Mekânın betimlemesi burada başlıyor ve devam ediyor.");
    await vi.waitFor(() => expect(players.length).toBeGreaterThan(0));
    stopAnswerOf((key) => key.startsWith("inscription:"));
    expect(players.at(-1)!.removed).toBe(false);
    stopAnswerOf((key) => key === "description:a");
    await expect(reading).resolves.toBeUndefined();
    expect(players.at(-1)!.removed).toBe(true);
    players.length = 0;
  });

  it("ends when stopped mid-part, and lets the player go", async () => {
    const reading = speakAnswer("cevap", "Hamza Bey Camii'ni Hamza Bey yaptırdı. Fatih dönemine tarihlenir.");
    await vi.waitFor(() => expect(players).toHaveLength(1));
    stopAnswer();
    await expect(reading).resolves.toBeUndefined();
    expect(players).toHaveLength(1);
    expect(players[0]!.removed).toBe(true);
    // Paused first: on Android remove() alone can leave the sound playing.
    expect(players[0]!.paused).toBe(true);
  });
});

describe("speechParts", () => {
  it("asks for the first sentence on its own, so it plays at once, and the rest together", () => {
    expect(
      speechParts("Hamza Bey Camii'ni Hamza Bey 1430'larda yaptırdı. Cümle kapısında Fetih suresi yazar. Kitabesi celî sülüstür."),
    ).toEqual(["Hamza Bey Camii'ni Hamza Bey 1430'larda yaptırdı.", "Cümle kapısında Fetih suresi yazar. Kitabesi celî sülüstür."]);
  });

  it("keeps a short first sentence with the next, and an answer of one sentence whole", () => {
    expect(speechParts("Evet. Rampa var ve tuvalet erişilebilir. Otopark yakında.")).toEqual([
      "Evet. Rampa var ve tuvalet erişilebilir.",
      "Otopark yakında.",
    ]);
    expect(speechParts("  Merhaba!\n")).toEqual(["Merhaba!"]);
    expect(speechParts("")).toEqual([]);
  });

  it("does not end a sentence at an ordinal or an abbreviation", () => {
    expect(speechParts("Cami 15. yüzyılda Hamza Bey tarafından yaptırıldı. Kitabesinde H. 840 yazar. Hz. Ali anılır.")).toEqual([
      "Cami 15. yüzyılda Hamza Bey tarafından yaptırıldı.",
      "Kitabesinde H. 840 yazar. Hz. Ali anılır.",
    ]);
  });

  it("does not end a sentence at a sultan's Roman numeral", () => {
    expect(speechParts("Hamza Bey Camii'ni, I. Mehmed ve II. Murad'ın veziri yaptırmış. Fatih dönemine tarihlenir.")).toEqual([
      "Hamza Bey Camii'ni, I. Mehmed ve II. Murad'ın veziri yaptırmış.",
      "Fatih dönemine tarihlenir.",
    ]);
  });

  it("never asks for more than the API reads at once", () => {
    const long = `${"kelime ".repeat(300).trim()}.`;
    const parts = speechParts(`Kısa bir giriş cümlesi burada duruyor. ${long}`);
    expect(parts.every((part) => part.length <= VOICE_SPEECH_MAX_CHARS)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(`Kısa bir giriş cümlesi burada duruyor. ${long}`);
  });
});
