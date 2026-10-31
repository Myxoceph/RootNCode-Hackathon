import { describe, expect, it } from "vitest";

import { mapTiers } from "../src/map/prominence";

const places = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, prominence: 40 - i }));

describe("mapTiers", () => {
  it("keeps the best known longest and lets the least known half go first", () => {
    const tiers = mapTiers(places, undefined);
    expect([...tiers.values()].filter((tier) => tier === 3)).toHaveLength(3);
    expect(tiers.get("p0")).toBe(3);
    expect(tiers.get("p5")).toBe(2);
    expect(tiers.get("p15")).toBe(1);
    expect(tiers.get("p39")).toBe(0);
  });

  it("keeps the landmark to the last, however little its record tells", () => {
    expect(mapTiers(places, "p39").get("p39")).toBe(3);
    expect(mapTiers([{ id: "a", prominence: 0 }], "a").get("a")).toBe(3);
  });
});
