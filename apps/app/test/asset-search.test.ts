import type { AssetSummary } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { foldTurkish, searchAssets } from "../src/search/asset-search";

const asset = (id: string, name: string, type: string, district: string, city = "bursa", prominence = 0) =>
  ({ id, name, type: { code: type, label: type }, district, city: { code: city, label: city === "bursa" ? "Bursa" : "Edirne" }, prominence }) as AssetSummary;

const assets = [
  asset("ulucami", "Ulucami", "Cami", "Osmangazi", "bursa", 40),
  asset("koza", "Koza Han", "Han", "Osmangazi", "bursa", 20),
  asset("orhan-hamam", "Orhan Gazi Hamamı", "Hamam", "Osmangazi", "bursa", 5),
  asset("selimiye", "Selimiye Camii", "Cami", "Merkez", "edirne", 50),
];
const cities = [
  { code: "bursa", label: "Bursa", assetCount: 3, plate: 16 },
  { code: "edirne", label: "Edirne", assetCount: 1, plate: 22 },
  { code: "konya", label: "Konya", assetCount: 0, plate: 42 },
];

describe("foldTurkish", () => {
  it("ignores case and Turkish marks", () => {
    expect(foldTurkish("ULUCAMİ")).toBe("ulucami");
    expect(foldTurkish("Şehzade  Çeşmesi")).toBe("sehzade cesmesi");
  });
});

describe("searchAssets", () => {
  it("finds an asset however it is typed, with or without spaces", () => {
    expect(searchAssets("ulu cami", assets, cities).assets.map((a) => a.id)).toEqual(["ulucami"]);
    expect(searchAssets("KOZA", assets, cities).assets.map((a) => a.id)).toEqual(["koza"]);
  });

  it("puts name matches before type or district matches, the better known first", () => {
    expect(searchAssets("cami", assets, cities).assets.map((a) => a.id)).toEqual(["selimiye", "ulucami"]);
    expect(searchAssets("hamam", assets, cities).assets.map((a) => a.id)).toEqual(["orhan-hamam"]);
  });

  it("finds cities that have assets, and keeps to one city when asked", () => {
    expect(searchAssets("bur", assets, cities).cities.map((c) => c.code)).toEqual(["bursa"]);
    expect(searchAssets("kon", assets, cities).cities).toEqual([]);
    const inBursa = searchAssets("cami", assets, cities, "bursa");
    expect(inBursa.assets.map((a) => a.id)).toEqual(["ulucami"]);
    expect(inBursa.cities).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchAssets("  ", assets, cities)).toEqual({ cities: [], assets: [] });
  });
});
