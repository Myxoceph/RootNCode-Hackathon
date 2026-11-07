import type { AssetDetail } from "@vagabonds/contracts";
import { useEffect, useState } from "react";

import * as Location from "expo-location";

import { dataSource } from "@/data";
import { getLang, useLang } from "@/i18n";
import type { Position } from "@/lib/current-position";

import { arTargets } from "./ar-targets";
import { hasReadableInscription, INSCRIPTION_ASSET, isTrackable, NEARBY_METERS, nearbyAssets, targetsNear } from "./inscription-targets";

/** The nearest assets whose records are fetched to find their inscriptions. */
const NEARBY_ASSETS = 8;
/** How long to wait for a fresh location fix before opening the sample asset instead. */
const POSITION_TIMEOUT_MS = 3_000;
/** A position the phone already knows is used at once while it is this fresh: a visitor walks 300 m in minutes. */
const KNOWN_MAX_AGE_MS = 2 * 60_000;
/** Degrees of latitude in 1 m, for the box the nearby assets are asked for in. */
const DEGREES_PER_METER = 1 / 111_320;

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

/**
 * The visitor's position: the one the phone knows when it is fresh, else a new fix within
 * `POSITION_TIMEOUT_MS` (indoors there may be none). The permission is asked for first, outside
 * that time, so the visitor's moment of reading the question does not use it up. `null` when refused.
 */
async function positionInTime(): Promise<Position | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const known = await Location.getLastKnownPositionAsync({ maxAge: KNOWN_MAX_AGE_MS }).catch(() => null);
    if (known) return { lat: known.coords.latitude, lng: known.coords.longitude };
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), POSITION_TIMEOUT_MS)),
    ]);
    return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** The ids of the assets within `NEARBY_METERS` of `position`, nearest first: those in a box around it, not every asset. */
async function assetsAround(position: Position): Promise<string[]> {
  const dLat = NEARBY_METERS * DEGREES_PER_METER;
  const dLng = dLat / Math.max(0.2, Math.cos((position.lat * Math.PI) / 180));
  const box: [number, number, number, number] = [position.lng - dLng, position.lat - dLat, position.lng + dLng, position.lat + dLat];
  const page = await dataSource.listAssets({ bbox: box, limit: 50, offset: 0 }, getLang()).catch(() => null);
  return page ? nearbyAssets(page.items, position).map((asset) => asset.id) : [];
}

/**
 * The nearest assets with an inscription: those the camera can find, picked from the short list of
 * targets (ar/ar-targets.ts, at once when it is stored); else, for the reading mode, the nearest
 * with a text to read, from the assets in a box around the visitor. `null` when nothing near has one.
 */
async function nearbyInscriptions(position: Position): Promise<AssetDetail[] | null> {
  const targets = await arTargets();
  const withTargets = [...new Set(targetsNear(targets ?? [], position).map((t) => t.assetId))].slice(0, NEARBY_ASSETS);
  if (withTargets.length > 0) {
    const trackable = (await fetchAll(withTargets)).filter(isTrackable);
    if (trackable.length > 0) return trackable;
  }
  const near = await fetchAll((await assetsAround(position)).slice(0, NEARBY_ASSETS));
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
