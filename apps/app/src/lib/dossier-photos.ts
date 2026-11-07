import type { AdminAssetRecord, AssetDetail, Media } from "@vagabonds/contracts";

/**
 * Photos set between the dossier's blocks. A photo names the block it follows (`identity`,
 * `timeline`…, an added block's `custom:<id>`) or the chapter (`section:<id>`) as `dossierAfter`
 * (contract 0.3.28): the panel saves it with the record and `GET /assets/:id` sends it.
 */

/** The dossier's blocks a photo can follow, in their order. */
export const DOSSIER_BLOCKS = ["identity", "history", "timeline", "people", "waqf", "inscriptions", "facts", "legends", "accessibility"] as const;

export type DossierPlacements = Record<string, string>;

/** The place a photo is set after in the dossier, or null. */
export const dossierAfterOf = (media: Media): string | null => media.dossierAfter ?? null;

/** The photo with its place in the dossier set, or cleared. */
export const withDossierAfter = (media: Media, after: string | null): Media => ({ ...media, dossierAfter: after });

/** Each photo's place, by its key, as the asset gives them. */
export function placementsOf(asset: AssetDetail | null): DossierPlacements {
  const places: DossierPlacements = {};
  for (const m of asset?.media ?? []) {
    const after = dossierAfterOf(m);
    if (after) places[m.key] = after;
  }
  return places;
}

/**
 * The photos to show after each block or chapter that is drawn. A photo whose block is not drawn
 * (it has nothing in it) shows after the nearest drawn block before it.
 */
export function photosByPlace(asset: AssetDetail, drawn: string[]): Map<string, Media[]> {
  const sections = new Set(asset.sections.map((s) => s.id));
  const byPlace = new Map<string, Media[]>();
  for (const m of asset.media) {
    let place = dossierAfterOf(m);
    if (!place) continue;
    if (place.startsWith("section:") && (!sections.has(place.slice("section:".length)) || !drawn.includes("history"))) place = "history";
    if (!place.startsWith("section:") && !drawn.includes(place)) {
      const at = DOSSIER_BLOCKS.indexOf(place as (typeof DOSSIER_BLOCKS)[number]);
      place = DOSSIER_BLOCKS.slice(0, Math.max(at, 0) + 1).reverse().find((key) => drawn.includes(key)) ?? drawn[0] ?? place;
    }
    byPlace.set(place, [...(byPlace.get(place) ?? []), m]);
  }
  return byPlace;
}

/** Each photo's place in the dossier, by its key, as the record holds them. */
export function placementsIn(record: AdminAssetRecord | null): DossierPlacements {
  const places: DossierPlacements = {};
  for (const m of record?.media ?? []) if (m.dossierAfter) places[m.key] = m.dossierAfter;
  return places;
}

/**
 * The photos after an upload or a removal: the server's list, with what the admin has changed and
 * not saved yet kept (captions, order, places). A photo just uploaded as the cover takes the cover;
 * a removed cover's place goes to the one the server chose.
 */
export function mergePhotos(draft: AdminAssetRecord["media"], server: AdminAssetRecord["media"]): AdminAssetRecord["media"] {
  const onServer = new Map(server.map((m) => [m.key, m]));
  const kept = draft.filter((m) => onServer.has(m.key));
  const known = new Set(kept.map((m) => m.key));
  const added = server.filter((m) => !known.has(m.key));
  const merged = [...kept, ...added.map((m) => ({ ...m }))];
  const newCover = added.find((m) => m.isCover);
  if (newCover) return merged.map((m) => ({ ...m, isCover: m.key === newCover.key }));
  if (merged.some((m) => m.isCover)) return merged;
  return merged.map((m) => ({ ...m, isCover: onServer.get(m.key)?.isCover ?? false }));
}
