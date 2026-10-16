import { describe, expect, it } from "vitest";
import { nonEmpty, pick, resolveLang } from "../src/lib/lang.ts";
import { toIdFragment } from "../src/modules/assets/assets.repository.ts";

describe("resolveLang", () => {
  it("prefers the explicit ?lang= over the header", () => {
    expect(resolveLang("tr", "en-US,en;q=0.9")).toBe("tr");
  });

  it("uses the best supported Accept-Language match", () => {
    expect(resolveLang(undefined, "de-DE,en;q=0.8,tr;q=0.5")).toBe("en");
    expect(resolveLang(undefined, "tr;q=0.4, en;q=0.6")).toBe("en");
    expect(resolveLang(undefined, "en;q=0, tr")).toBe("tr");
  });

  it("falls back to Turkish", () => {
    expect(resolveLang(undefined, undefined)).toBe("tr");
    expect(resolveLang(undefined, "de, fr;q=0.5")).toBe("tr");
  });
});

describe("pick", () => {
  it("returns English when asked and available", () => {
    expect(pick("Cami", "Mosque", "en")).toBe("Mosque");
  });

  it("falls back to Turkish when English is missing or blank", () => {
    expect(pick("Cami", null, "en")).toBe("Cami");
    expect(pick("Cami", "  ", "en")).toBe("Cami");
  });

  it("treats empty strings as no value", () => {
    expect(pick("", null, "tr")).toBeNull();
    expect(nonEmpty("")).toBeNull();
  });
});

describe("toIdFragment", () => {
  it("matches how asset ids are written", () => {
    expect(toIdFragment("Kurşunlu Han")).toBe("kursunlu-han");
    expect(toIdFragment("ÖRDEKLİ Hamam")).toBe("ordekli-hamam");
    expect(toIdFragment("Çelebi Mehmed")).toBe("celebi-mehmed");
    expect(toIdFragment("  ?? ")).toBe("");
  });
});
