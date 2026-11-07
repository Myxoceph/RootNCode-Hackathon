import { kmBetween } from "./dense-area";

/** Places closer than this share a spot: at the city's closest zoom (~1.8 m a pixel) their seals overlap. */
const SAME_SPOT_METERS = 25;
/** How far apart the seals of a shared spot are drawn at least: a seal's width at that zoom. */
const SPREAD_METERS = 30;
/** Points closer than this count as one point: they have no direction to keep. */
const SAME_POINT_METERS = 1;
const METERS_PER_DEGREE = 111_320;

export interface SpreadPlace {
  id: string;
  lat: number;
  lng: number;
  /** Only the neighbourhood is known (`coordinates.approximate`): it may move, an exact place may not. */
  approximate: boolean;
}

/**
 * Where to draw each place so that no two seals lie on top of each other. A complex already stands
 * for its buildings (map.tsx); what is left on one spot are places of their own whose points
 * coincide, most often several assets given the same neighbourhood centre because the book names
 * only the neighbourhood, or a mosque and the tomb a few metres off. On such a spot an exact place stays
 * where it is and the others move away from it; with no exact one, or more than one, they all move away
 * from the spot's middle. Each keeps its direction, so the map still shows which lies where; places on
 * one point are set evenly round it. Places alone keep their point.
 */
export function spreadPlaces<T extends SpreadPlace>(places: ReadonlyArray<T>): Map<string, { lat: number; lng: number }> {
  const at = new Map(places.map((place) => [place.id, { lat: place.lat, lng: place.lng }]));
  const seen = new Set<string>();
  for (const place of places) {
    if (seen.has(place.id)) continue;
    // Everything reachable through spots closer than SAME_SPOT_METERS is one spot.
    const spot = [place];
    seen.add(place.id);
    for (let i = 0; i < spot.length; i++) {
      for (const other of places) {
        if (!seen.has(other.id) && kmBetween(spot[i]!, other) * 1000 < SAME_SPOT_METERS) {
          seen.add(other.id);
          spot.push(other);
        }
      }
    }
    if (spot.length < 2) continue;

    spot.sort((a, b) => (a.id < b.id ? -1 : 1));
    const exact = spot.filter((p) => !p.approximate);
    const fixed = exact.length === 1 ? exact[0]! : null;
    const center = fixed ?? { lat: spot.reduce((s, p) => s + p.lat, 0) / spot.length, lng: spot.reduce((s, p) => s + p.lng, 0) / spot.length };
    const around = spot.filter((p) => p !== fixed);
    const degLng = METERS_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180);
    // Far enough out that two neighbours on the circle are SPREAD_METERS apart, and an exact place's as far.
    const between = around.length > 1 ? SPREAD_METERS / (2 * Math.sin(Math.PI / around.length)) : SPREAD_METERS / 2;
    const radius = fixed ? Math.max(SPREAD_METERS, between) : between;
    around.forEach((p, i) => {
      const east = (p.lng - center.lng) * degLng;
      const north = (p.lat - center.lat) * METERS_PER_DEGREE;
      const off = Math.hypot(east, north);
      // Its own direction from the middle; on the middle itself, evenly round it, the first straight up.
      const angle = off >= SAME_POINT_METERS ? Math.atan2(north, east) : Math.PI / 2 - (2 * Math.PI * i) / around.length;
      const distance = Math.max(off, radius);
      at.set(p.id, { lat: center.lat + (Math.sin(angle) * distance) / METERS_PER_DEGREE, lng: center.lng + (Math.cos(angle) * distance) / degLng });
    });
  }
  return at;
}
