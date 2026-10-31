import type { RelationDirection } from "@vagabonds/contracts";
import type { RelationRecord } from "./assets.repository.ts";

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6_371_008.8;
const METERS_PER_DEGREE_LAT = (Math.PI * EARTH_RADIUS_METERS) / 180;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle (haversine) distance in meters. */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Box (minLng, minLat, maxLng, maxLat) that contains every point within `radiusMeters`
 * of `center`. Used as an index-friendly prefilter before the exact distance check;
 * fine for Turkey's latitudes, not meant for the poles or the antimeridian.
 */
export function boundingBox(center: Point, radiusMeters: number): [number, number, number, number] {
  const dLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const dLng = radiusMeters / (METERS_PER_DEGREE_LAT * Math.cos(toRadians(center.lat)));
  return [center.lng - dLng, center.lat - dLat, center.lng + dLng, center.lat + dLat];
}

export interface DirectedRelation {
  relation: RelationRecord;
  direction: RelationDirection;
  /** The asset at the other end of the link. */
  otherId: string;
}

/**
 * Turns the raw links of `assetId` into what the client sees:
 * - a link recorded on both assets (A→B and B→A, same type) is shown once,
 *   preferring the one recorded on `assetId` itself;
 * - links to assets that are missing or not visible are counted, not returned.
 */
export function selectRelations(
  assetId: string,
  relations: RelationRecord[],
  isVisible: (id: string) => boolean,
): { items: DirectedRelation[]; unavailable: DirectedRelation[] } {
  const byLink = new Map<string, DirectedRelation>();
  for (const relation of relations) {
    const outgoing = relation.source_asset_id === assetId;
    const otherId = outgoing ? relation.target_asset_id : relation.source_asset_id;
    const key = `${otherId}:${relation.relation_type.code}`;
    if (byLink.get(key)?.direction === "outgoing") continue;
    byLink.set(key, { relation, direction: outgoing ? "outgoing" : "incoming", otherId });
  }

  const items: DirectedRelation[] = [];
  const unavailable: DirectedRelation[] = [];
  for (const link of byLink.values()) (isVisible(link.otherId) ? items : unavailable).push(link);
  return { items, unavailable };
}
