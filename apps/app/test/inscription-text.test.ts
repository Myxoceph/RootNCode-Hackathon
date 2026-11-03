import { describe, expect, it, vi } from "vitest";

vi.mock("@/data", () => ({ DataError: class extends Error {} }));
vi.mock("../src/ar/inscription-targets", () => ({ featuredInscription: () => null }));
vi.mock("@/lib/language", () => ({ transliterationLanguage: () => undefined }));

const { inscriptionPlace, inscriptionText, isInscriptionReading, readAloudKey } = await import("../src/ar/use-inscription");

const inscription = (id: string) => ({ id, location: null, translation: `Çeviri ${id}`, transliteration: null, language: null, hijriYear: null, gregorian: null, sources: [] });
const asset = {
  id: "bursa-osmangazi-ornek",
  name: "Örnek Türbe",
  waqf: null,
  inscriptions: [inscription("k1"), { ...inscription("k2"), location: "Kapı üzerinde" }],
} as unknown as Parameters<typeof inscriptionText>[0];

describe("inscription text", () => {
  it("gives each inscription of an asset its own reading key, even without a location", () => {
    const first = inscriptionText(asset, "k1")!;
    const second = inscriptionText(asset, "k2")!;
    expect(readAloudKey(first)).not.toBe(readAloudKey(second));
    expect(isInscriptionReading(readAloudKey(first))).toBe(true);
    expect(isInscriptionReading("description:bursa-osmangazi-ornek")).toBe(false);
  });

  it("says the place from the asset's name and the inscription's location", () => {
    expect(inscriptionPlace(inscriptionText(asset, "k1")!)).toBe("Örnek Türbe");
    expect(inscriptionPlace(inscriptionText(asset, "k2")!)).toBe("Örnek Türbe · Kapı üzerinde");
  });
});
