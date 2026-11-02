import type { AssetDetail } from "@vagabonds/contracts";
import { useEffect, useState } from "react";

import { dataSource } from "@/data";
import { currentPosition } from "@/lib/current-position";

import { hasReadableInscription, INSCRIPTION_ASSET, isTrackable, nearbyAssets } from "./inscription-targets";

/** The nearest assets whose records are fetched to find their inscriptions. */
const NEARBY_ASSETS = 5;

export type InscriptionScope =
  | { status: "loading" }
  | { status: "error" }
  /** `nearby`: the assets around the visitor; otherwise the one asked for, or `INSCRIPTION_ASSET`. */
  | { status: "ready"; assets: AssetDetail[]; nearby: boolean };

/**
 * The asset and, for a complex, its buildings: the map shows a complex in their place, and its
 * inscriptions are on them. Those the camera can find; else the first with a text to read.
 */
async function withBuildings(id: string): Promise<AssetDetail[]> {
  const asset = await dataSource.getAsset(id, "tr");
  if (!asset) return [];
  const buildings = await Promise.all(asset.children.map((child) => dataSource.getAsset(child.id, "tr").catch(() => null)));
  const all = [asset, ...buildings.filter((b): b is AssetDetail => b !== null)];
  const trackable = all.filter(isTrackable);
  return trackable.length > 0 ? trackable : [all.find(hasReadableInscription) ?? asset];
}

/**
 * The assets whose inscriptions the camera looks for: the one asked for (`id`, from its page,
 * with its buildings for a complex); without one, those near the visitor that have an
 * inscription to find; when none is near (or the location is refused), `INSCRIPTION_ASSET`.
 * A new `attempt` asks again.
 */
export function useInscriptionScope(id: string | undefined, attempt = 0): InscriptionScope {
  const [scope, setScope] = useState<InscriptionScope>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setScope({ status: "loading" });
    const fallback = () => withBuildings(id ?? INSCRIPTION_ASSET).then((assets) => ({ assets, nearby: false }));
    (async () => {
      if (id) return fallback();
      const position = await currentPosition();
      if (!position) return fallback();
      const page = await dataSource.listAssets({ limit: 500, offset: 0 }, "tr");
      const near = nearbyAssets(page.items, position).slice(0, NEARBY_ASSETS);
      const details = await Promise.all(near.map((asset) => dataSource.getAsset(asset.id, "tr").catch(() => null)));
      const readable = details.filter((asset): asset is AssetDetail => asset !== null && isTrackable(asset));
      return readable.length > 0 ? { assets: readable, nearby: true } : fallback();
    })().then(
      (found) => active && setScope({ status: "ready", ...found }),
      () => active && setScope({ status: "error" }),
    );
    return () => {
      active = false;
    };
  }, [id, attempt]);

  return scope;
}
