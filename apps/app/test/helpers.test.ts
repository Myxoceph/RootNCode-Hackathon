import { AR_MINDAR_VERSION, AssetDetailSchema, type AssetDetail, type InscriptionV2 } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { featuredInscription, INSCRIPTION_ASSET, isTrackable } from "../src/ar/inscription-targets";
import { capsuleForSoundKey, captionAt, capsules, formatSeconds } from "../src/content/capsules";
import details from "../src/data/fixtures/details.json";
import { pulseItemsFromTips } from "../src/data/pulse";
import { formatDate } from "../src/lib/format-date";

const ulucami = AssetDetailSchema.parse((details as Record<string, unknown>)[INSCRIPTION_ASSET]);
const orhanBey = AssetDetailSchema.parse((details as Record<string, unknown>)["bursa-osmangazi-orhan-bey-camii"]);

const target = (mindarVersion = AR_MINDAR_VERSION) => ({ mindUrl: "https://media.allbytech.com/x.mind", mindarVersion });
const withTarget = (asset: AssetDetail, index: number, arTarget = target()): AssetDetail => ({
  ...asset,
  inscriptions: asset.inscriptions.map((i, n): InscriptionV2 => (n === index ? { ...i, arTarget } : i)),
});

describe("Taşın Dili inscription choice", () => {
  it("picks the inscription with an AR target first", () => {
    const asset = withTarget(orhanBey, 2);
    expect(featuredInscription(asset)?.id).toBe(asset.inscriptions[2]!.id);
  });

  it("falls back to the demo's inscription, then the first with a text", () => {
    expect(featuredInscription(ulucami)?.id).toBe("minber-kapi-kitabesi");
    expect(featuredInscription(orhanBey)?.id).toBe("onarim-kitabesi-1417");
  });

  it("opens the camera for Ulucami (test targets) and for assets with a target of this MindAR", () => {
    expect(isTrackable(ulucami)).toBe(true);
    expect(isTrackable(orhanBey)).toBe(false);
    expect(isTrackable(withTarget(orhanBey, 0))).toBe(true);
    expect(isTrackable(withTarget(orhanBey, 0, target("1.1.0")))).toBe(false);
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
