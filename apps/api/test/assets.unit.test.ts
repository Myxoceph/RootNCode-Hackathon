import { describe, expect, it } from "vitest";
import { yearLabel } from "../src/modules/assets/assets.mapper.ts";

describe("yearLabel", () => {
  it("takes the Gregorian year the dating names when it is close to the start year", () => {
    // Ulucami: the record starts in 1396 (construction), the dating names its completion.
    expect(yearLabel("H. 802 / M. 1399-1400", 1396, 14, "tr")).toBe("1399");
    expect(yearLabel("H. Şevval 816 / M. Aralık 1413-Ocak 1414", 1413, 15, "tr")).toBe("1413");
  });

  it("keeps the start year when the dating's year is another event", () => {
    expect(yearLabel("1219; H. 1317 / M. 1899-1900 onarımı", 1219, 13, "tr")).toBe("1219");
  });

  it("falls back to the century, and to nothing, never to a Hijri year or a death", () => {
    expect(yearLabel("15. yüzyıl başları (vakfiye: H. 3 Şaban 804 / M. 8 Mart 1402)", null, 15, "tr")).toBe("XV. yüzyıl");
    expect(yearLabel("15. yüzyıl (kesin tarih bilinmiyor); mevcut yapı 2008", null, 15, "en")).toBe("15th century");
    expect(yearLabel("Yapım yılı belirtilmemiş; Hüsâmeddin Bursevî H. 1042 / M. 1632'de vefat etmiştir", null, null, "tr")).toBeNull();
    expect(yearLabel(null, null, 19, "tr")).toBe("XIX. yüzyıl");
  });
});
