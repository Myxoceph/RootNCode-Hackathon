import { describe, expect, it } from "vitest";

import { beads, bleedBlots, scallopPath, starPath, wornSpots } from "../src/lib/seal-impression";

const distance = (dot: { x: number; y: number }) => Math.hypot(dot.x - 110, dot.y - 110);

describe("seal impression", () => {
  it("draws a closed bumpy edge with one arc per bump", () => {
    const path = scallopPath(110, 110, 98, 30);
    expect(path.startsWith("M208.0 110.0")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.match(/A/g)).toHaveLength(30);
  });

  it("draws an eight-pointed star", () => {
    expect(starPath(110, 44, 6, 2.6).match(/L/g)).toHaveLength(15);
  });

  it("lays the beads evenly on their circle", () => {
    const ring = beads(110, 110, 91, 36, 1.6);
    expect(ring).toHaveLength(36);
    for (const bead of ring) expect(distance(bead)).toBeCloseTo(91, 5);
  });

  it("wears the same name the same way, and another name differently", () => {
    const one = wornSpots("Ulu Cami", 110, 110, 20, 94, 26);
    expect(wornSpots("Ulu Cami", 110, 110, 20, 94, 26)).toEqual(one);
    expect(wornSpots("Yeşil Cami", 110, 110, 20, 94, 26)).not.toEqual(one);
    for (const spot of one) {
      expect(distance(spot)).toBeGreaterThanOrEqual(20);
      expect(distance(spot)).toBeLessThanOrEqual(94);
    }
  });

  it("soaks the ink just past the edge, all the way round", () => {
    const blots = bleedBlots("Ulu Cami", 110, 110, 102, 22);
    expect(blots).toHaveLength(22);
    for (const blot of blots) {
      expect(distance(blot)).toBeGreaterThanOrEqual(102);
      expect(distance(blot)).toBeLessThanOrEqual(105);
      // Inside the seal's square, so none is cut off.
      expect(blot.x + blot.r).toBeLessThanOrEqual(220);
      expect(blot.y + blot.r).toBeLessThanOrEqual(220);
    }
  });
});
