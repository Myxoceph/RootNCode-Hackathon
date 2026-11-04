import type { AssetDetail, Media } from "@vagabonds/contracts";

/**
 * Photos set between the dossier's blocks. A photo names the block it follows (`identity`,
 * `timeline`…, an added block's `custom:<id>`) or the chapter (`section:<id>`) as `dossierAfter`.
 *
 * The API does not send this yet: the panel's editor sets it on its preview, and the dossier reads
 * it from any photo that has it, so it shows as soon as the API does.
 */

/** The dossier's blocks a photo can follow, in their order. */
export const DOSSIER_BLOCKS = ["identity", "history", "timeline", "people", "waqf", "inscriptions", "facts", "legends", "accessibility"] as const;

export type DossierPlacements = Record<string, string>;

type PlacedMedia = Media & { dossierAfter?: string | null };

/** The place a photo is set after in the dossier, or null. */
export const dossierAfterOf = (media: Media): string | null => (media as PlacedMedia).dossierAfter ?? null;

/** The photo with its place in the dossier set, or cleared. */
export const withDossierAfter = (media: Media, after: string | null): Media => Object.assign({}, media, { dossierAfter: after });

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
