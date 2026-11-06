import type { AssetDetail } from "@vagabonds/contracts";
import { useEffect, useState } from "react";

import { dataSource, loadAllAssets } from "@/data";
import { getLang, useLang } from "@/i18n";
import { currentPosition, type Position } from "@/lib/current-position";

import { hasReadableInscription, INSCRIPTION_ASSET, isTrackable, nearbyAssets } from "./inscription-targets";

/** The nearest assets whose records are fetched to find their inscriptions. */
const NEARBY_ASSETS = 8;
/** How long to wait for a location fix before opening the sample asset instead. */
const POSITION_TIMEOUT_MS = 8_000;

export type InscriptionScope =
  | { status: "loading" }
  | { status: "error" }
  /** `nearby`: the assets around the visitor; otherwise the one asked for, or `INSCRIPTION_ASSET`. */
  | { status: "ready"; assets: AssetDetail[]; nearby: boolean };

const fetchAll = (ids: string[]) =>
  Promise.all(ids.map((id) => dataSource.getAsset(id, getLang()).catch(() => null))).then((assets) =>
    assets.filter((asset): asset is AssetDetail => asset !== null),
  );

/**
 * The asset and, for a complex, its buildings: the map shows a complex in their place, and its
 * inscriptions are on them. Those the camera can find; else the first with a text to read.
 */
async function withBuildings(id: string): Promise<AssetDetail[]> {
  const asset = await dataSource.getAsset(id, getLang());
  if (!asset) return [];
  const all = [asset, ...(await fetchAll(asset.children.map((child) => child.id)))];
  const trackable = all.filter(isTrackable);
  return trackable.length > 0 ? trackable : [all.find(hasReadableInscription) ?? asset];
}

/** The visitor's position, or `null` when it is refused or takes longer than `POSITION_TIMEOUT_MS` (indoors). */
function positionInTime(): Promise<Position | null> {
  return Promise.race([currentPosition(), new Promise<null>((resolve) => setTimeout(() => resolve(null), POSITION_TIMEOUT_MS))]);
}

/**
 * The nearest assets with an inscription: those the camera can find; else, for the reading
 * mode, the nearest with a text to read. `null` when nothing near has one, or the list is out of reach.
 */
async function nearbyInscriptions(position: Position): Promise<AssetDetail[] | null> {
  const all = await loadAllAssets().catch(() => null);
  if (!all) return null;
  const near = await fetchAll(nearbyAssets(all, position).slice(0, NEARBY_ASSETS).map((asset) => asset.id));
  const trackable = near.filter(isTrackable);
  if (trackable.length > 0) return trackable;
  const readable = near.find(hasReadableInscription);
  return readable ? [readable] : null;
}

/**
 * The assets whose inscriptions the camera looks for: the one asked for (`id`, from its page,
 * with its buildings for a complex); without one, those near the visitor that have an
 * inscription; when none is near (or the location is refused, slow, or not asked for:
 * `locate` false on the web and with a screen reader), `INSCRIPTION_ASSET`. `locate` null
 * waits, so the location is not asked for before it is known to be wanted.
 * A new `attempt` asks again.
 */
export function useInscriptionScope(id: string | undefined, locate: boolean | null, attempt = 0): InscriptionScope {
  const [scope, setScope] = useState<InscriptionScope>({ status: "loading" });
  // Another language: the records' words again.
  const lang = useLang();

  useEffect(() => {
    let active = true;
    setScope({ status: "loading" });
    if (!id && locate === null) return;
    const fallback = () => withBuildings(id ?? INSCRIPTION_ASSET).then((assets) => ({ assets, nearby: false }));
    (async () => {
      if (id || !locate) return fallback();
      const position = await positionInTime();
      const near = position ? await nearbyInscriptions(position) : null;
      return near ? { assets: near, nearby: true } : fallback();
    })().then(
      (found) => active && setScope({ status: "ready", ...found }),
      () => active && setScope({ status: "error" }),
    );
    return () => {
      active = false;
    };
  }, [id, locate, attempt, lang]);

  return scope;
}

/**
 * Whether Taşın Dili has something on this asset: an inscription of its own to read, or, for a
 * complex, on one of its buildings (their records are fetched, and kept for the screen). `false`
 * until known.
 */
export function useHasInscriptions(asset: AssetDetail | null): boolean {
  const own = asset ? hasReadableInscription(asset) : false;
  const children = own || !asset ? "" : asset.children.map((child) => child.id).join(",");
  const [buildings, setBuildings] = useState<{ key: string; found: boolean }>({ key: "", found: false });

  useEffect(() => {
    if (!children) return;
    let active = true;
    fetchAll(children.split(",")).then((records) => active && setBuildings({ key: children, found: records.some(hasReadableInscription) }));
    return () => {
      active = false;
    };
  }, [children]);

  return own || (children !== "" && buildings.key === children && buildings.found);
}
