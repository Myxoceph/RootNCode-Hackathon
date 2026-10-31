import { AR_MINDAR_VERSION, type AssetDetail, type InscriptionV2 } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { featuredInscription, INSCRIPTION_ASSET, isTrackable } from "../src/ar/inscription-targets";
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

/** Only the fields Taşın Dili reads; built here so a re-recorded fixture cannot break the tests. */
const asset = (id: string, inscriptions: InscriptionV2[]) => ({ id, inscriptions }) as unknown as AssetDetail;

describe("Taşın Dili inscription choice", () => {
  const untranslated = inscription("untranslated");
  const translated = inscription("translated", { translation: "Bu kapıyı ... yaptırdı." });

  it("picks the inscription with an AR target first", () => {
    const tracked = inscription("tracked", { arTarget: target() });
    expect(featuredInscription(asset("x", [untranslated, translated, tracked]))?.id).toBe("tracked");
  });

  it("falls back to the demo's inscription, then the first with a text, then the first", () => {
    const demo = inscription("minber-kapi-kitabesi");
    expect(featuredInscription(asset("x", [translated, demo]))?.id).toBe("minber-kapi-kitabesi");
    expect(featuredInscription(asset("x", [untranslated, translated]))?.id).toBe("translated");
    expect(featuredInscription(asset("x", [untranslated]))?.id).toBe("untranslated");
    expect(featuredInscription(asset("x", []))).toBeUndefined();
  });

  it("opens the camera for Ulucami (test targets) and for assets with a target of this MindAR", () => {
    expect(isTrackable(asset(INSCRIPTION_ASSET, []))).toBe(true);
    expect(isTrackable(asset("x", [translated]))).toBe(false);
    expect(isTrackable(asset("x", [inscription("t", { arTarget: target() })]))).toBe(true);
    expect(isTrackable(asset("x", [inscription("t", { arTarget: target("1.1.0") })]))).toBe(false);
  });
});

describe("capsules", () => {
  it("finds a capsule by its sound key", () => {
    expect(capsuleForSoundKey(capsules.hamam.soundKey)).toBe("hamam");
    expect(capsuleForSoundKey("no-such-sound")).toBeUndefined();
  });

  it("shows the caption of the last cue passed, the first one before any", () => {
    const [[, first], [secondAt, second]] = capsules.hamam.captions as [[number, string], [number, string]];
    expect(captionAt("hamam", 0)).toBe(first);
    expect(captionAt("hamam", secondAt - 0.1)).toBe(first);
    expect(captionAt("hamam", secondAt)).toBe(second);
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
