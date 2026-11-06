import { describe, expect, it } from "vitest";

import { centuryOf, paragraphsOf, readableDate, readingMinutes, sentencesOf } from "../src/lib/reading";

describe("sentencesOf", () => {
  it("does not split at abbreviations or ordinals", () => {
    const text = "Minberdeki tarihten H. 802 / M. 1399 anlaşılır. Yapı 15. yüzyılda onarıldı. Sonra kapandı.";
    expect(sentencesOf(text)).toEqual(["Minberdeki tarihten H. 802 / M. 1399 anlaşılır.", "Yapı 15. yüzyılda onarıldı.", "Sonra kapandı."]);
  });

  it("keeps a Turkish capital as a sentence start", () => {
    expect(sentencesOf("Cami açıldı. İlk imamı geldi.")).toEqual(["Cami açıldı.", "İlk imamı geldi."]);
  });
});

describe("paragraphsOf", () => {
  it("loses no text and keeps paragraphs short", () => {
    const text = Array.from({ length: 12 }, (_, i) => `Bu uzun bir cümledir ve kitabın ${i}. sayfasından alınmıştır.`).join(" ");
    const paragraphs = paragraphsOf(text, 200);
    expect(paragraphs.join(" ")).toBe(text);
    expect(paragraphs.length).toBeGreaterThan(1);
    for (const paragraph of paragraphs) expect(paragraph.length).toBeLessThanOrEqual(200);
  });

  it("keeps the record's own line breaks", () => {
    expect(paragraphsOf("Bir.\nİki.")).toEqual(["Bir.", "İki."]);
  });
});

describe("helpers", () => {
  it("names the century", () => {
    expect(centuryOf(1399, "tr")).toBe("XIV. yüzyıl");
    expect(centuryOf(1400, "tr")).toBe("XIV. yüzyıl");
    expect(centuryOf(1901, "tr")).toBe("XX. yüzyıl");
  });

  it("reads a record date and leaves other wording alone", () => {
    expect(readableDate("1494-02-19", "tr")).toBe("19 Şubat 1494");
    expect(readableDate("Aralık 1413", "tr")).toBe("Aralık 1413");
  });

  it("never says zero minutes", () => {
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(900)).toBe(5);
  });
});
