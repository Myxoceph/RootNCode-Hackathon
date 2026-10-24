import type { AssetDetail, InscriptionV2 } from "@vagabonds/contracts";
import { useEffect, useState } from "react";

import { MINDAR_VERSION } from "./mindar";
import { testTargetLabels, testTargetsMind } from "./test-targets.generated";

/** The asset Taşın Dili opens on. */
export const INSCRIPTION_ASSET = "bursa-osmangazi-ulucami";
/** Shown for the test targets, and when the asset has no inscription with a target: the H7 inscription. */
const FALLBACK_INSCRIPTION = "minber-kapi-kitabesi";

/** What a recognized target stands for, by its index in the `.mind` file. */
export interface TrackedTarget {
  inscriptionId: string;
  /** What the target image shows. */
  label: string;
  /** A stand-in photo bundled with the app, not the inscription itself. */
  test: boolean;
}

export interface TargetSet {
  /** A compiled `.mind` file, base64. */
  mind: string;
  targets: TrackedTarget[];
}

const testSet: TargetSet = {
  mind: testTargetsMind,
  targets: testTargetLabels.map((label) => ({ inscriptionId: FALLBACK_INSCRIPTION, label, test: true })),
};

/** The inscription Taşın Dili is about: the first with an AR target, else the demo's, else the first with a text. */
export function featuredInscription(asset: AssetDetail): InscriptionV2 | undefined {
  return (
    asset.inscriptions.find((i) => i.arTarget) ??
    asset.inscriptions.find((i) => i.id === FALLBACK_INSCRIPTION) ??
    asset.inscriptions.find((i) => i.translation || i.transliteration) ??
    asset.inscriptions[0]
  );
}

/** Whether the camera has something to look for: the asset's own target, or (Ulucami) the bundled test targets. */
export function isTrackable(asset: AssetDetail): boolean {
  return asset.id === INSCRIPTION_ASSET || asset.inscriptions.some((i) => i.arTarget?.mindarVersion === MINDAR_VERSION);
}

/**
 * The targets to track, once the asset has loaded (`settled`): its inscription's
 * `.mind` file from the dataset (Y13), or the bundled test targets when it has
 * none, it was compiled for another MindAR or it cannot be downloaded. MindAR
 * loads one `.mind` file at a time, so an asset tracks its first target only.
 */
export function useTargetSet(asset: AssetDetail | null, settled: boolean): TargetSet | null {
  const [set, setSet] = useState<TargetSet | null>(null);
  const inscription = asset?.inscriptions.find((i) => i.arTarget?.mindarVersion === MINDAR_VERSION);
  const mindUrl = inscription?.arTarget?.mindUrl ?? null;
  const inscriptionId = inscription?.id;
  const label = inscription?.location ?? "Kitabe";

  useEffect(() => {
    if (!settled) return;
    if (!mindUrl || !inscriptionId) {
      setSet(testSet);
      return;
    }
    let active = true;
    downloadBase64(mindUrl).then(
      (mind) => active && setSet({ mind, targets: [{ inscriptionId, label, test: false }] }),
      () => active && setSet(testSet),
    );
    return () => {
      active = false;
    };
  }, [settled, mindUrl, inscriptionId, label]);

  return set;
}

async function downloadBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
