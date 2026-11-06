import type { AssetDetail, Media } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { CAPSULE_SECONDS } from "../src/content/capsules";
import { firstSentence, scenePhotos, sealScenes, stepSeconds } from "../src/lib/seal-scenes";

const certain = { code: "certain", label: "Kesin" };
const disputed = { code: "disputed", label: "Tartışmalı" };

function asset(over: Partial<AssetDetail> = {}): AssetDetail {
  return {
    name: "Ulu Cami",
    summary: "Yirmi kubbeli bir cami.",
    yearLabel: "1399",
    dating: { startYear: 1399, confidence: certain },
    founder: null,
    waqf: null,
    highlights: [],
    timeline: [],
    legends: [],
    media: [],
    ...over,
  } as unknown as AssetDetail;
}

describe("firstSentence", () => {
  it("does not end a sentence at an ordinal or a short abbreviation", () => {
    expect(firstSentence("II. Bayezid yaptırdı. Sonra yandı.")).toBe("II. Bayezid yaptırdı.");
    expect(firstSentence("Hz. Ali adına yapıldı. Sonra yandı.")).toBe("Hz. Ali adına yapıldı.");
  });

  it("takes off markdown, and gives up on what is too long to read", () => {
    expect(firstSentence("**Kalın** bir söz.")).toBe("Kalın bir söz.");
    expect(firstSentence(`${"uzun ".repeat(40)}cümle. Kısa.`)).toBeNull();
  });
});

describe("sealScenes", () => {
  it("tells who built it, then the deed, then what to look at", () => {
    const scenes = sealScenes(
      asset({
        founder: { name: "Yıldırım Bayezid", confidence: certain },
        waqf: { deedExcerpt: "Her gün çorba verile.", conditions: null, confidence: certain },
        highlights: [{ feature: "minber", title: "Kündekâri minber", hint: null, sectionId: null }],
      } as unknown as Partial<AssetDetail>),
      "tr",
    );
    expect(scenes.map((scene) => [scene.head, scene.text])).toEqual([
      ["1399", "Yıldırım Bayezid yaptırdı."],
      ["VAKFİYEDEN", "Her gün çorba verile."],
      ["BURAYA BAK", "Kündekâri minber"],
    ]);
  });

  it("says no disputed claim as a plain fact", () => {
    const scenes = sealScenes(
      asset({
        dating: { startYear: 1399, confidence: disputed },
        founder: { name: "Belki Biri", confidence: disputed },
        waqf: { deedExcerpt: "Şüpheli şart.", conditions: null, confidence: disputed },
        timeline: [{ id: "e", year: 1500, note: null, title: "Şüpheli olay", type: { code: "other" }, confidence: disputed }],
      } as unknown as Partial<AssetDetail>),
      "tr",
    );
    expect(scenes).toEqual([{ id: "summary", head: "BU ESER", text: "Yirmi kubbeli bir cami." }]);
  });

  it("names a legend as one, and leaves out one the sources refute", () => {
    const legend = (id: string, verdict: string) => ({ id, title: id, body: `${id} anlatılır.`, verdict, sources: [] });
    const scenes = sealScenes(asset({ legends: [legend("yalan", "refuted_by_source"), legend("halk", "folk_belief")] } as unknown as Partial<AssetDetail>), "tr");
    expect(scenes[0]).toEqual({ id: "legend-halk", head: "RİVAYET", text: "halk anlatılır." });
    expect(scenes.some((scene) => scene.text.startsWith("yalan"))).toBe(false);
  });

  it("tells what the asset is before its upkeep, reads no editor's note, and speaks English in English", () => {
    const events = [
      { id: "kurulus", year: 1399, note: null, title: "Built", type: { code: "construction" }, confidence: certain },
      { id: "onarim", year: 1900, note: null, title: "Repaired", type: { code: "repair" }, confidence: certain },
      { id: "deprem", year: 1855, note: "The book gives 1855.", title: "Damaged in an earthquake", type: { code: "disaster" }, confidence: certain },
    ];
    const scenes = sealScenes(asset({ founder: { name: "Bayezid I", confidence: certain }, timeline: events } as unknown as Partial<AssetDetail>), "en");
    expect(scenes.map((scene) => [scene.head, scene.text])).toEqual([
      ["1399", "Founded by Bayezid I."],
      ["THIS PLACE", "Yirmi kubbeli bir cami."],
      ["1855", "Damaged in an earthquake"],
    ]);
  });

  it("gives a record with nothing short its summary at more length", () => {
    const summary = `${"uzun ".repeat(40)}cümle. Kısa.`;
    expect(sealScenes(asset({ summary }), "tr").map((scene) => scene.id)).toEqual(["summary"]);
  });
});

describe("scenePhotos", () => {
  it("starts with the cover and leaves out views from above and other media", () => {
    const media = (key: string, kind: string, subject: string | null, isCover = false) => ({ key, kind, subject, isCover }) as unknown as Media;
    const photos = scenePhotos(asset({ media: [media("a", "photo", "portal"), media("b", "photo", "aerial"), media("c", "drawing", null), media("d", "photo", "exterior", true)] }));
    expect(photos.map((photo) => photo.key)).toEqual(["d", "a"]);
  });
});

describe("stepSeconds", () => {
  it("lasts as long as a capsule, however many scenes there are", () => {
    for (const scenes of [0, 1, 2, 3]) {
      expect(stepSeconds(scenes).reduce((sum, s) => sum + s, 0)).toBe(CAPSULE_SECONDS);
      expect(stepSeconds(scenes)).toHaveLength(scenes + 2);
    }
  });
});
