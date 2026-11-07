import type { ArTargetEntry, AssetDetail, AssetSummary, InscriptionV2 } from "@vagabonds/contracts";
import { useEffect, useState } from "react";

import { kmBetween } from "@/map/dense-area";

import { MINDAR_VERSION } from "./mindar";
import type { TrackerTarget } from "./tracker-page";

/** The asset Taşın Dili opens on when nothing near the visitor can be read; the Kamera tab plays its demo on it. */
export const INSCRIPTION_ASSET = "bursa-osmangazi-azeb-bey-turbesi";
/** How close an asset must be for the camera to look for its inscriptions. */
export const NEARBY_METERS = 300;
/** Most photos looked for at once: a photo without a `.mind` file takes seconds to compile on the phone. */
export const MAX_TARGETS = 6;
/** Longest text drawn over the stone; the card below has the whole of it. */
const OVERLAY_MAX = 160;

/**
 * An inscription the camera can recognize: one whose record names the photo of it
 * (`arTargetMediaKey`) and that has a text to show once it is found.
 */
export interface CameraInscription {
  assetId: string;
  inscriptionId: string;
  /** Where it is: "Cümle kapısının üzerinde". */
  /** Today's Turkish (or the reading), short enough to sit over the stone. */
  overlay: string;
  /** The ~1280 px JPEG compiled on the phone when there is no `.mind` file. */
  image: string;
  /** The dataset's compiled `.mind` file, when it is for this MindAR. */
  mindUrl: string | null;
}

/** The text drawn over a found inscription: its translation, else its reading, cut at a word. */
export function overlayText(inscription: InscriptionV2): string | null {
  const text = (inscription.translation ?? inscription.transliteration)?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= OVERLAY_MAX) return text;
  const cut = text.slice(0, OVERLAY_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : OVERLAY_MAX)}…`;
}

/**
 * Where the data pipeline puts the `.mind` file it compiles from a photo: beside the photo's
 * variants (`arTargetMindKey`, packages/contracts), from the same ~1280 px JPEG the phone compiles.
 */
export function mindUrlBeside(photoUrl: string): string {
  return `${photoUrl.slice(0, photoUrl.lastIndexOf("/"))}/target-mindar-${MINDAR_VERSION}.mind`;
}

/** The ~1280 px JPEG of the photo: big enough to recognise, small enough to compile in seconds. */
export function compileSource(media: AssetDetail["media"][number]): string {
  const jpgs = [...media.sources.jpg].sort((a, b) => a.width - b.width);
  return (jpgs.find((s) => s.width >= 1000) ?? jpgs[jpgs.length - 1] ?? media.sources.webp[0]!).url;
}

export function cameraInscriptions(asset: AssetDetail): CameraInscription[] {
  return asset.inscriptions.flatMap((inscription) => {
    const photo = asset.media.find((m) => m.kind === "photo" && m.key === inscription.arTargetMediaKey);
    const overlay = overlayText(inscription);
    if (!photo || !overlay) return [];
    const mindUrl = inscription.arTarget?.mindarVersion === MINDAR_VERSION ? inscription.arTarget.mindUrl : null;
    return [{ assetId: asset.id, inscriptionId: inscription.id, overlay, image: compileSource(photo), mindUrl }];
  });
}

export function hasReadableInscription(asset: AssetDetail): boolean {
  return asset.inscriptions.some((i) => i.translation || i.transliteration);
}

/** Whether the camera has something to look for on this asset. */
export function isTrackable(asset: AssetDetail): boolean {
  return cameraInscriptions(asset).length > 0;
}

/** The inscription Taşın Dili is about: the first the camera can find, else the first with a text, else the first. */
export function featuredInscription(asset: AssetDetail): InscriptionV2 | undefined {
  const tracked = cameraInscriptions(asset)[0]?.inscriptionId;
  return (
    asset.inscriptions.find((i) => i.id === tracked) ??
    asset.inscriptions.find((i) => i.translation || i.transliteration) ??
    asset.inscriptions[0]
  );
}

/** The located assets within `meters` of `position`, nearest first. Approximate points are too rough to count. */
export function nearbyAssets(assets: readonly AssetSummary[], position: { lat: number; lng: number }, meters = NEARBY_METERS): AssetSummary[] {
  return assets
    .flatMap((asset) => {
      const point = asset.coordinates;
      if (!point || point.approximate) return [];
      const distance = kmBetween(position, point) * 1000;
      return distance <= meters ? [{ asset, distance }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .map(({ asset }) => asset);
}

/** The targets (`GET /ar-targets`) within `meters` of `position`, nearest first. */
export function targetsNear(items: readonly ArTargetEntry[], position: { lat: number; lng: number }, meters = NEARBY_METERS): ArTargetEntry[] {
  return items
    .flatMap((item) => (item.coordinates ? [{ item, distance: kmBetween(position, item.coordinates) * 1000 }] : []))
    .filter(({ distance }) => distance <= meters)
    .sort((a, b) => a.distance - b.distance)
    .map(({ item }) => item);
}

/** What a recognized target stands for, by its index in the tracked set. */
export type TrackedTarget = CameraInscription;

export interface TargetSet {
  /** Names the set, to keep its compiled `.mind` file for the next time. */
  key: string;
  target: TrackerTarget;
  targets: TrackedTarget[];
}

/** Sets compiled on this phone while the app is open; a second visit starts at once. */
const compiledSets = new Map<string, string>();

export function rememberCompiledSet(key: string, mind: string) {
  compiledSets.set(key, mind);
}

/**
 * What the camera looks for: the inscriptions of `assets`, at most `MAX_TARGETS`. Each comes as
 * its `.mind` file when the dataset has one that downloads, else as its photo for the phone to
 * compile, so a target not yet uploaded still works. `null` while the files are on their way.
 */
export function useTargetSet(assets: readonly AssetDetail[] | null): TargetSet | null {
  const [set, setSet] = useState<TargetSet | null>(null);
  const targets = assets ? assets.flatMap(cameraInscriptions).slice(0, MAX_TARGETS) : null;
  const key = targets?.map((t) => `${t.assetId}/${t.inscriptionId}`).join(",") ?? null;

  useEffect(() => {
    if (!targets || !key) return;
    const cached = compiledSets.get(key);
    if (cached) {
      setSet({ key, target: { mind: cached }, targets });
      return;
    }
    let active = true;
    Promise.all(
      // From the phone when fetched before, else downloaded and kept (ar/mind-store.ts, loaded only
      // here: the helpers above stay free of native modules).
      targets.map((t) => {
        const url = t.mindUrl;
        if (!url) return { image: t.image };
        return import("./mind-store").then(({ loadMind }) => loadMind(url)).then((mind) => ({ mind }), () => ({ image: t.image }));
      }),
    ).then((sources) => active && setSet({ key, target: { sources }, targets }));
    return () => {
      active = false;
    };
    // `targets` follows `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return set?.key === key ? set : null;
}
