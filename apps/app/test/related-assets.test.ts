import type { AssetRelation, AssetSummary } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { isAssetUnlocked, relatedAssetsOf, relatedPlacesOf } from "../src/lib/related-assets";

function relation(code: string, id: string): AssetRelation {
  return { type: { code, label: code }, asset: { id } } as unknown as AssetRelation;
}

describe("relatedAssetsOf", () => {
  it("lists an asset joined in two ways once, the most telling way first", () => {
    const related = relatedAssetsOf([relation("urban_context", "a"), relation("same_founder", "a")]);
    expect(related).toHaveLength(1);
    expect(related[0]?.reasons.map((reason) => reason.type.code)).toEqual(["same_founder", "urban_context"]);
  });

  it("puts next-door neighbours after what ties assets more tellingly", () => {
    const related = relatedAssetsOf([relation("urban_context", "a"), relation("new_kind", "b"), relation("same_architect", "c")]);
    expect(related.map((entry) => entry.asset.id)).toEqual(["c", "a", "b"]);
  });
});

describe("isAssetUnlocked", () => {
  const asset = (id: string, parentId: string | null) => ({ id, parentId }) as AssetSummary;

  it("is open when the asset or the complex standing for it is unlocked", () => {
    expect(isAssetUnlocked(asset("cami", null), new Set(["cami"]))).toBe(true);
    expect(isAssetUnlocked(asset("cami", "kulliye"), new Set(["kulliye"]))).toBe(true);
  });

  it("stays shut otherwise", () => {
    expect(isAssetUnlocked(asset("cami", "kulliye"), new Set(["baska"]))).toBe(false);
    expect(isAssetUnlocked(asset("kulliye", null), new Set(["cami"]))).toBe(false);
  });
});

describe("relatedPlacesOf", () => {
  const to = (id: string, parentId: string | null = null) => ({ asset: { id, parentId } }) as unknown as AssetRelation;
  const places = new Set(["self", "kulliye", "han"]);

  it("draws to the complex standing for a building, once", () => {
    expect(relatedPlacesOf([to("cami", "kulliye"), to("kulliye"), to("han")], "self", places)).toEqual(["kulliye", "han"]);
  });

  it("leaves out other cities and the asset's own buildings", () => {
    expect(relatedPlacesOf([to("elsewhere"), to("sadirvan", "self")], "self", places)).toEqual([]);
  });
});
