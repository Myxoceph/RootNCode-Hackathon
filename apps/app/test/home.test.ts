import type { AssetSummary } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { centuriesOf, centuryOf, firstCentury, showcaseAssets, stripIndexAt } from "../src/lib/home";

const asset = (id: string, prominence: number, over: Partial<AssetSummary> = {}) =>
  ({ id, prominence, parentId: null, cover: { key: id }, city: { code: "bursa", label: "Bursa" }, coordinates: { lat: 40, lng: 29 }, ...over }) as unknown as AssetSummary;

describe("showcaseAssets", () => {
  it("keeps assets with a photo that stand on their own, best known first", () => {
    const list = [asset("a", 1), asset("b", 9), asset("c", 5, { cover: null }), asset("d", 7, { parentId: "b" })];
    expect(showcaseAssets(list).map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("centuryOf", () => {
  it("reads a year and a written century", () => {
    expect(centuryOf("1399")).toBe(14);
    expect(centuryOf("1400")).toBe(14);
    expect(centuryOf("1401")).toBe(15);
    expect(centuryOf("560")).toBe(6);
    expect(centuryOf("XV. yüzyıl")).toBe(15);
    expect(centuryOf("XVIII. yüzyıl")).toBe(18);
    expect(centuryOf("XIX. yüzyıl")).toBe(19);
  });

  it("has no century without a year", () => {
    expect(centuryOf(null)).toBeNull();
    expect(centuryOf("bilinmiyor")).toBeNull();
  });
});

describe("centuriesOf", () => {
  const list = [asset("a", 1, { yearLabel: "1399" }), asset("b", 9, { yearLabel: "XIV. yüzyıl" }), asset("c", 5, { yearLabel: "1250" }), asset("d", 7, { yearLabel: null })];

  it("groups oldest first, best known first, and leaves out unknown years", () => {
    const centuries = centuriesOf(list);
    expect(centuries.map((item) => [item.roman, item.decades, item.assets.map((one) => one.id)])).toEqual([
      ["XIII", "1200'ler", ["c"]],
      ["XIV", "1300'ler", ["b", "a"]],
    ]);
  });

  it("opens on the century of the best-known asset", () => {
    expect(firstCentury(centuriesOf(list))?.roman).toBe("XIV");
    expect(firstCentury([])).toBeNull();
  });
});

describe("stripIndexAt", () => {
  it("gives each century an equal share and stays on the strip past its ends", () => {
    expect(stripIndexAt(0, 300, 3)).toBe(0);
    expect(stripIndexAt(150, 300, 3)).toBe(1);
    expect(stripIndexAt(299, 300, 3)).toBe(2);
    expect(stripIndexAt(-40, 300, 3)).toBe(0);
    expect(stripIndexAt(340, 300, 3)).toBe(2);
  });
});
