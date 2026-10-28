import { describe, expect, it } from "vitest";
import { boundingBox, distanceMeters, selectRelations, type Point } from "../src/modules/assets/assets.network.ts";
import type { RelationRecord } from "../src/modules/assets/assets.repository.ts";

const ULUCAMI = { lat: 40.18417, lng: 29.06167 };
const ORDEKLI = { lat: 40.18775, lng: 29.06828 };

/** Point reached by going `meters` from `start` on the given bearing (spherical model). */
function destination(start: Point, bearingDegrees: number, meters: number): Point {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  const angular = meters / R;
  const bearing = bearingDegrees * rad;
  const lat1 = start.lat * rad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lng2 =
    start.lng * rad +
    Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / rad, lng: lng2 / rad };
}

describe("distanceMeters", () => {
  it("is zero for the same point and symmetric", () => {
    expect(distanceMeters(ULUCAMI, ULUCAMI)).toBe(0);
    expect(distanceMeters(ULUCAMI, ORDEKLI)).toBeCloseTo(distanceMeters(ORDEKLI, ULUCAMI), 6);
  });

  it("matches known distances", () => {
    expect(distanceMeters(ULUCAMI, ORDEKLI)).toBeGreaterThan(680);
    expect(distanceMeters(ULUCAMI, ORDEKLI)).toBeLessThan(700);
    expect(distanceMeters(ULUCAMI, destination(ULUCAMI, 37, 5_000))).toBeCloseTo(5_000, 3);
  });
});

describe("boundingBox", () => {
  it("contains every point on the circle", () => {
    const radius = 2_000;
    const [minLng, minLat, maxLng, maxLat] = boundingBox(ULUCAMI, radius);
    for (let bearing = 0; bearing < 360; bearing += 5) {
      const point = destination(ULUCAMI, bearing, radius * 0.9999);
      expect(point.lng).toBeGreaterThanOrEqual(minLng);
      expect(point.lng).toBeLessThanOrEqual(maxLng);
      expect(point.lat).toBeGreaterThanOrEqual(minLat);
      expect(point.lat).toBeLessThanOrEqual(maxLat);
    }
  });
});

function relation(source: string, target: string, type: string): RelationRecord {
  return {
    source_asset_id: source,
    target_asset_id: target,
    description_tr: `${source} → ${target}`,
    description_en: null,
    confidence: "certain",
    relation_type: { code: type, label_tr: type, label_en: null },
  };
}

describe("selectRelations", () => {
  const visible = new Set(["a", "b", "c"]);
  const isVisible = (id: string) => visible.has(id);

  it("returns links in both directions", () => {
    const { items } = selectRelations("a", [relation("a", "b", "same_founder"), relation("c", "a", "waqf_income")], isVisible);

    expect(items.map(({ otherId, direction }) => [otherId, direction])).toEqual([
      ["b", "outgoing"],
      ["c", "incoming"],
    ]);
  });

  it("shows a link recorded on both assets once, preferring this asset's record", () => {
    for (const relations of [
      [relation("b", "a", "same_complex"), relation("a", "b", "same_complex")],
      [relation("a", "b", "same_complex"), relation("b", "a", "same_complex")],
    ]) {
      const { items } = selectRelations("a", relations, isVisible);
      expect(items).toHaveLength(1);
      expect(items[0]?.direction).toBe("outgoing");
      expect(items[0]?.relation.source_asset_id).toBe("a");
    }
  });

  it("keeps links of different types to the same asset", () => {
    const { items } = selectRelations("a", [relation("a", "b", "same_founder"), relation("b", "a", "same_complex")], isVisible);
    expect(items).toHaveLength(2);
  });

  it("counts links to missing or hidden assets without returning them", () => {
    const { items, unavailableCount } = selectRelations(
      "a",
      [relation("a", "b", "same_founder"), relation("a", "not-in-dataset", "waqf_income"), relation("hidden", "a", "same_complex")],
      isVisible,
    );
    expect(items.map((item) => item.otherId)).toEqual(["b"]);
    expect(unavailableCount).toBe(2);
  });
});
