/** [[west, south], [east, north]] */
export type LngLatBounds = [[number, number], [number, number]];

/** A neighbour this close counts towards a place's density. */
const NEIGHBOUR_KM = 3;
/** How far around the landmark the camera frames: a few streets each way. */
const AROUND_KM = 0.2;

interface Point {
  lat: number;
  lng: number;
}

function kmBetween(a: Point, b: Point): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The point with the most others within 3 km; `null` without any point. */
export function densestPoint<T extends Point>(points: ReadonlyArray<T>): T | null {
  let best: T | null = null;
  let bestCount = -1;
  for (const point of points) {
    let count = 0;
    for (const other of points) if (kmBetween(point, other) <= NEIGHBOUR_KM) count++;
    if (count > bestCount) {
      best = point;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Where the camera opens a city: its landmark (the asset with `landmarkId`) or, without one
 * on the map, the asset where the others crowd most. `null` when no asset is on the map.
 */
export function cityLandmark<T extends Point & { id: string }>(assets: ReadonlyArray<T>, landmarkId: string | undefined): T | null {
  return assets.find((asset) => asset.id === landmarkId) ?? densestPoint(assets);
}

/** A square around a point, `AROUND_KM` to each side: the landmark and its streets. */
export function areaAround(point: Point): LngLatBounds {
  const dLat = AROUND_KM / 111.32;
  const dLng = AROUND_KM / (111.32 * Math.cos((point.lat * Math.PI) / 180));
  return [
    [point.lng - dLng, point.lat - dLat],
    [point.lng + dLng, point.lat + dLat],
  ];
}
