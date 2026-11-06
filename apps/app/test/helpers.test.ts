import { AR_MINDAR_VERSION, type AssetDetail, type InscriptionV2 } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { cameraInscriptions, featuredInscription, hasReadableInscription, isTrackable, nearbyAssets, overlayText } from "../src/ar/inscription-targets";
import { capsuleForSoundKey, captionAt, capsules, formatSeconds } from "../src/content/capsules";
import { pulseItemsFromTips } from "../src/data/pulse";
import { formatDate } from "../src/lib/format-date";

const target = (mindarVersion = AR_MINDAR_VERSION) => ({ mindUrl: "https://media.allbytech.com/x.mind", mindarVersion });

function inscription(id: string, fields: Partial<InscriptionV2> = {}): InscriptionV2 {
  return {
    id,
    location: null,
    language: "ar",
    script: null,
    transliteration: null,
    translation: null,
    author: null,
    hijriYear: null,
    gregorian: null,
    note: null,
    arTargetMediaKey: null,
    arTarget: null,
    sources: [],
    ...fields,
  };
}

const jpg = (width: number) => ({ url: `https://media.allbytech.com/m03/${width}.jpg`, width, height: width / 2 });
const photo = { key: "m03", kind: "photo", sources: { jpg: [jpg(480), jpg(1280)], webp: [] } };

/** Only the fields Taşın Dili reads; built here so a re-recorded fixture cannot break the tests. */
const asset = (id: string, inscriptions: InscriptionV2[]) => ({ id, inscriptions, media: [photo] }) as unknown as AssetDetail;

describe("Taşın Dili inscription choice", () => {
  const untranslated = inscription("untranslated");
  const translated = inscription("translated", { translation: "Bu kapıyı ... yaptırdı." });
  const photographed = inscription("photographed", { translation: "Şüphesiz biz sana apaçık bir fetih verdik.", arTargetMediaKey: "m03" });

  it("picks the inscription the camera can find first", () => {
    expect(featuredInscription(asset("x", [untranslated, translated, photographed]))?.id).toBe("photographed");
  });

  it("falls back to the first with a text, then the first", () => {
    expect(featuredInscription(asset("x", [untranslated, translated]))?.id).toBe("translated");
    expect(featuredInscription(asset("x", [untranslated]))?.id).toBe("untranslated");
    expect(featuredInscription(asset("x", []))).toBeUndefined();
  });

  it("looks for inscriptions with a photo of them and a text, by the photo's 1280 px JPEG or its .mind file", () => {
    expect(isTrackable(asset("x", [translated]))).toBe(false);
    // A photo key the asset has no photo for, and a photographed inscription without a text.
    expect(isTrackable(asset("x", [inscription("t", { translation: "Metin", arTargetMediaKey: "m09" })]))).toBe(false);
    expect(isTrackable(asset("x", [inscription("t", { arTargetMediaKey: "m03" })]))).toBe(false);

    expect(cameraInscriptions(asset("x", [translated, photographed]))).toEqual([
      {
        assetId: "x",
        inscriptionId: "photographed",
        overlay: "Şüphesiz biz sana apaçık bir fetih verdik.",
        image: "https://media.allbytech.com/m03/1280.jpg",
        mindUrl: null,
      },
    ]);
    const compiled = inscription("c", { translation: "Metin", arTargetMediaKey: "m03", arTarget: target() });
    expect(cameraInscriptions(asset("x", [compiled]))[0]!.mindUrl).toBe("https://media.allbytech.com/x.mind");
    // A file of another MindAR cannot be loaded: the photo is compiled instead.
    const outdated = inscription("c", { translation: "Metin", arTargetMediaKey: "m03", arTarget: target("1.1.0") });
    expect(cameraInscriptions(asset("x", [outdated]))[0]!.mindUrl).toBeNull();
  });

  it("reads an asset's inscriptions only when one has a text", () => {
    expect(hasReadableInscription(asset("x", [untranslated, translated]))).toBe(true);
    expect(hasReadableInscription(asset("x", [untranslated]))).toBe(false);
  });

  it("lays the translation over the stone, else the reading, cut at a word", () => {
    expect(overlayText(inscription("t", { translation: "Bir\n  iki", transliteration: "Bir iki" }))).toBe("Bir iki");
    expect(overlayText(inscription("t", { transliteration: "İnnâ fetahnâ" }))).toBe("İnnâ fetahnâ");
    expect(overlayText(inscription("t"))).toBeNull();
    const long = overlayText(inscription("t", { translation: "kelime ".repeat(40) }))!;
    expect(long.length).toBeLessThanOrEqual(161);
    expect(long).toMatch(/kelime…$/);
  });

  it("finds the assets within 300 m, nearest first, leaving out approximate points", () => {
    const at = (id: string, lat: number, approximate = false) => ({ id, coordinates: { lat, lng: 29.06, approximate } }) as never;
    const here = { lat: 40.19, lng: 29.06 };
    // 0.001° of latitude is about 111 m.
    const found = nearbyAssets([at("far", 40.194), at("near", 40.1905), at("closest", 40.1901), at("rough", 40.1902, true)], here);
    expect(found.map((a) => a.id)).toEqual(["closest", "near"]);
  });
});

describe("capsules", () => {
  it("finds a capsule by its sound key", () => {
    expect(capsuleForSoundKey(capsules.hamam.soundKey)).toBe("hamam");
    expect(capsuleForSoundKey("no-such-sound")).toBeUndefined();
  });

  it("shows the caption of the last cue passed, the first one before any", () => {
    const [[, first], [secondAt, second]] = capsules.hamam.captions as [[number, string], [number, string]];
    expect(captionAt("hamam", 0, "tr")).toBe(first);
    expect(captionAt("hamam", secondAt - 0.1, "tr")).toBe(first);
    expect(captionAt("hamam", secondAt, "tr")).toBe(second);
  });

  it("formats seconds as 0:SS", () => {
    expect(formatSeconds(4.9)).toBe("0:04");
    expect(formatSeconds(24)).toBe("0:24");
  });
});

describe("pulse items from dataset tips", () => {
  it("keeps the text, origin and date, with no author", () => {
    expect(pulseItemsFromTips([{ text: "Sabah erken gidin.", origin: "field_visit", collectedAt: "2026-10-01" }])).toEqual([
      { id: "tip-0", kind: "tip", text: "Sabah erken gidin.", origin: "field_visit", author: null, date: "2026-10-01" },
    ]);
  });
});

describe("formatDate", () => {
  it("never shifts a plain date", () => {
    expect(formatDate("2026-10-01")).toBe("1 Ekim 2026");
  });

  it("dates a moment by the day in Türkiye, like the pulse", () => {
    expect(formatDate("2026-10-24T22:51:00Z")).toBe("25 Ekim 2026");
    expect(formatDate("2026-10-24T20:00:00Z")).toBe("24 Ekim 2026");
  });
});
