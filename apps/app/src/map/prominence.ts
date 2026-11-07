/**
 * How long a city's place stays on the map as it zooms out: 3 to the last, 0 first to go
 * (MapCityAsset.tier).
 */
export type MapTier = 0 | 1 | 2 | 3;

/** Share of a city's places, from the best known down, that stays to each tier. */
const TIER_SHARES: ReadonlyArray<readonly [MapTier, number]> = [
  [3, 0.05],
  [2, 0.25],
  [1, 0.55],
];
/** However small the city, this many places stay to the last. */
const MIN_LAST = 3;

/**
 * Each place's tier by its prominence among the city's others: the best-known twentieth
 * (at least three, the landmark always among them) stays longest, the least known half goes
 * first. Equal prominence keeps the given order.
 */
export function mapTiers(places: ReadonlyArray<{ id: string; prominence: number }>, landmarkId: string | undefined): Map<string, MapTier> {
  const ranked = [...places].sort((a, b) => Number(b.id === landmarkId) - Number(a.id === landmarkId) || b.prominence - a.prominence);
  const tiers = new Map<string, MapTier>();
  ranked.forEach((place, index) => {
    const tier = TIER_SHARES.find(([level, share]) => index < Math.max(Math.ceil(ranked.length * share), level === 3 ? MIN_LAST : 0));
    tiers.set(place.id, tier ? tier[0] : 0);
  });
  return tiers;
}
