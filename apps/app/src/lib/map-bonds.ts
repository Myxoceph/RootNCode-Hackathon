import type { AssetRelation } from "@vagabonds/contracts";

import { getMessages } from "@/i18n";

import { compassPoint, distanceText, kmBetween } from "./bearing";
import { relatedAssetsOf } from "./related-assets";

interface Point {
  lat: number;
  lng: number;
}

/**
 * The bonds the map draws as lines from the chosen asset, in words, for those who cannot see
 * them: each related asset on this map, what joins the two and how far and which way it lies.
 * Only those on the open map, as only those get a line; `null` when there are none.
 */
export function bondsSpoken(from: Point, relations: AssetRelation[], onMap: ReadonlySet<string>): string | null {
  const w = getMessages().mapWords;
  const items = relatedAssetsOf(relations).flatMap(({ asset, reasons }) => {
    const here = onMap.has(asset.id) || (asset.parentId != null && onMap.has(asset.parentId));
    if (!here || !asset.coordinates) return [];
    const kinds = [...new Set(reasons.map((r) => r.type.label))].join(", ");
    const where = `${distanceText(kmBetween(from, asset.coordinates))} ${w.directions[compassPoint(from, asset.coordinates)] ?? ""}`;
    return [w.bond(asset.name, kinds, where)];
  });
  return items.length > 0 ? w.bonds(items.length, items.join("; ")) : null;
}
