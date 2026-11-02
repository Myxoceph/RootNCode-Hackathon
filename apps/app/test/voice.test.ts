import { VOICE_SPEECH_MAX_CHARS } from "@vagabonds/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-audio", () => ({ createAudioPlayer: vi.fn(), setAudioModeAsync: vi.fn() }));
vi.mock("expo-speech", () => ({ speak: vi.fn(), stop: vi.fn() }));
vi.mock("../src/data/voice", () => ({ speechSource: vi.fn() }));

const { speechParts } = await import("../src/lib/voice");

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
