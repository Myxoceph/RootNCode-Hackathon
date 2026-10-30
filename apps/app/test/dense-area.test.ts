import { describe, expect, it } from "vitest";

import { areaAround, cityLandmark, densestPoint } from "../src/map/dense-area";

const center = [
  { id: "a", lat: 40.183, lng: 29.06 },
  { id: "b", lat: 40.186, lng: 29.065 },
  { id: "c", lat: 40.19, lng: 29.07 },
  { id: "d", lat: 40.18, lng: 29.055 },
];
// İznik and Mudanya: far from the crowd.
const far = [
  { id: "iznik", lat: 40.43, lng: 29.72 },
  { id: "mudanya", lat: 40.37, lng: 28.88 },
];

describe("densestPoint", () => {
  it("is where most points crowd, not a far one; null without any", () => {
    expect(center).toContain(densestPoint([...far, ...center]));
    expect(densestPoint([])).toBeNull();
  });
});

describe("cityLandmark", () => {
  it("is the named landmark when it is on the map", () => {
    expect(cityLandmark([...far, ...center], "iznik")?.id).toBe("iznik");
  });

  it("falls back to the crowd without one", () => {
    expect(center).toContain(cityLandmark([...far, ...center], "missing"));
    expect(cityLandmark([...far, ...center], undefined)?.id).not.toMatch(/iznik|mudanya/);
    expect(cityLandmark([], "a")).toBeNull();
  });
});

describe("areaAround", () => {
  it("is a square of streets centred on the point", () => {
    const [[west, south], [east, north]] = areaAround({ lat: 40.183, lng: 29.06 });
    expect((west + east) / 2).toBeCloseTo(29.06, 6);
    expect((south + north) / 2).toBeCloseTo(40.183, 6);
    // About 0.4 km tall.
    expect((north - south) * 111.32).toBeCloseTo(0.4, 2);
  });
});
