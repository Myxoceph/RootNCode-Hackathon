import type { AssetRelation, AssetSummary } from "@vagabonds/contracts";

/** What ties two assets together most tellingly comes first; next-door neighbours last, as they are the most. */
const ORDER = ["same_founder", "same_architect", "same_craftsman", "architectural_lineage", "waqf_income", "waqf_land", "water_supply", "same_complex", "urban_context"];

function rank(code: string): number {
  const index = ORDER.indexOf(code);
  return index < 0 ? ORDER.length : index;
}

/** Said when the related assets of an asset still locked are asked for. */
export const LOCKED_WARNING = "Önce bu eserin kilidini açmalısın";

export interface RelatedAsset {
  asset: AssetSummary;
  /** Every way the two are joined, the most telling first. */
  reasons: AssetRelation[];
}

/** An asset's relations as one entry per related asset, however many ways the two are joined. */
export function relatedAssetsOf(items: AssetRelation[]): RelatedAsset[] {
  const byAsset = new Map<string, RelatedAsset>();
  for (const relation of [...items].sort((a, b) => rank(a.type.code) - rank(b.type.code))) {
    const entry = byAsset.get(relation.asset.id);
    if (entry) entry.reasons.push(relation);
    else byAsset.set(relation.asset.id, { asset: relation.asset, reasons: [relation] });
  }
  return [...byAsset.values()];
}

/** Unlocking a complex on the map opens the buildings it stands for. */
export function isAssetUnlocked(asset: Pick<AssetSummary, "id" | "parentId">, unlocked: ReadonlySet<string>): boolean {
  return unlocked.has(asset.id) || (asset.parentId != null && unlocked.has(asset.parentId));
}

/**
 * The places on the open map an asset is related to, once each: a complex stands for its buildings.
 * One in another city has no place here, and a building of the asset itself is not a line to draw.
 */
export function relatedPlacesOf(items: AssetRelation[], self: string, places: ReadonlySet<string>): string[] {
  const related = new Set<string>();
  for (const { asset } of items) {
    const place = places.has(asset.id) ? asset.id : asset.parentId && places.has(asset.parentId) ? asset.parentId : null;
    if (place && place !== self) related.add(place);
  }
  return [...related];
}
