import { describe, expect, it } from "vitest";

import {
  AR_MINDAR_VERSION,
  arTargetMindKey,
  CONTRIBUTION_TEXT_MAX,
  JournalLayoutSchema,
  normalizeContributionText,
  pickSealPhoto,
  RewardSchema,
} from "../src/index";

/**
 * The rules the API, the app and the data pipeline share: tested here, so a change to the contract
 * alone runs them.
 */
describe("arTargetMindKey", () => {
  it("puts the .mind file next to the photo's variants, named after the MindAR release", () => {
    expect(arTargetMindKey("assets/bursa-ulucami/inscription-1/w640.webp")).toBe(`assets/bursa-ulucami/inscription-1/target-mindar-${AR_MINDAR_VERSION}.mind`);
  });

  it("keeps only the folder, however deep the variant lies", () => {
    expect(arTargetMindKey("a/b/c/d/photo.jpg")).toBe(`a/b/c/d/target-mindar-${AR_MINDAR_VERSION}.mind`);
  });
});

describe("normalizeContributionText", () => {
  it("joins decomposed letters, so the count matches what is seen", () => {
    const decomposed = "Cami̇ avlusu"; // i + combining dot
    expect(normalizeContributionText(decomposed)).toBe("Cami̇ avlusu".normalize("NFC"));
    expect(normalizeContributionText("ü".normalize("NFD"))).toBe("ü");
  });

  it("unifies line breaks, drops control and bidi-override characters, trims trailing spaces", () => {
    expect(normalizeContributionText("bir\r\niki\rüç")).toBe("bir\niki\nüç");
    expect(normalizeContributionText("gizli‮metin\u0007")).toBe("gizlimetin");
    expect(normalizeContributionText("satır   \nsonu  ")).toBe("satır\nsonu");
  });

  it("collapses runs of blank lines to one and trims the ends", () => {
    expect(normalizeContributionText("\n\n  baş\n\n\n\nson  \n\n")).toBe("baş\n\nson");
  });

  it("leaves ordinary text as it is", () => {
    const text = "Kuzey kapısı sabahları kapalı; yan kapıdan girilir.";
    expect(normalizeContributionText(text)).toBe(text);
    expect(text.length).toBeLessThan(CONTRIBUTION_TEXT_MAX);
  });
});

describe("defaults that keep older answers readable", () => {
  it("a reward without a drawing lets the app pick one", () => {
    const reward = RewardSchema.parse({
      code: "vakif-kupa",
      title: "Vakıf kupası",
      description: "Kupa",
      partner: "Vakıflar",
      kind: "merch",
      costPoints: 300,
      minProvenVisits: 0,
      stock: 20,
      sample: true,
    });
    expect(reward.art).toBeNull();
  });

  it("a journal page arranged before drawing and stickers has none of either", () => {
    const layout = JournalLayoutSchema.parse({ photos: [], text: { x: 0, y: 0, width: 0.9, z: 0 } });
    expect(layout.strokes).toEqual([]);
    expect(layout.stickers).toEqual([]);
  });
});

describe("pickSealPhoto", () => {
  const photo = (id: string, subject: string | null, width = 1000, isCover = false, kind = "photo") => ({ id, kind, subject, width, height: 800, isCover });

  it("takes the best part there is a photo of, and of its photos the sharpest", () => {
    const picked = pickSealPhoto([photo("m1", "exterior", 4000), photo("m2", "mihrab", 900), photo("m3", "mihrab", 1200), photo("m4", "portal", 800, false, "drawing")]);
    expect(picked).toEqual({ photo: expect.objectContaining({ id: "m3" }), subject: "mihrab" });
  });

  it("falls back on the cover among the unsorted photos, never on one from above", () => {
    expect(pickSealPhoto([photo("m1", null), photo("m2", "photo", 1000, true), photo("m3", "aerial")])).toEqual({ photo: expect.objectContaining({ id: "m2" }), subject: null });
    expect(pickSealPhoto([photo("m3", "aerial")])).toBeNull();
  });
});
