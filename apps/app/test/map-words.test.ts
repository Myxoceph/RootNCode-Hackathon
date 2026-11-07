import type { AssetRelation, AssetSummary } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { compassPoint, distanceText, whereFrom } from "../src/lib/bearing";
import { bondsSpoken } from "../src/lib/map-bonds";

const ulucami = { name: "Ulucami", lat: 40.1841, lng: 29.0617 };

describe("where a place lies, in words", () => {
  it("finds the compass point", () => {
    expect(compassPoint(ulucami, { lat: 40.2, lng: 29.0617 })).toBe(0);
    expect(compassPoint(ulucami, { lat: 40.1841, lng: 29.1 })).toBe(2);
    expect(compassPoint(ulucami, { lat: 40.19, lng: 29.069 })).toBe(1);
    expect(compassPoint(ulucami, { lat: 40.17, lng: 29.0617 })).toBe(4);
  });

  it("says metres under a kilometre and kilometres over it", () => {
    expect(distanceText(0.149)).toBe("150 m");
    expect(distanceText(0.01)).toBe("50 m");
    expect(distanceText(1.24)).toBe("1,2 km");
    expect(distanceText(23.4)).toBe("23 km");
  });

  it("puts it in a sentence from the landmark", () => {
    expect(whereFrom(ulucami, { lat: 40.1841, lng: 29.0735 })).toBe("Ulucami ile arası 1 km, doğu yönünde");
  });
});

const summary = (id: string, name: string, lat: number, lng: number, parentId: string | null = null) =>
  ({ id, name, parentId, coordinates: { lat, lng, verified: true, approximate: false } }) as unknown as AssetSummary;
const relation = (asset: AssetSummary, code: string, label: string) =>
  ({ type: { code, label }, direction: "outgoing", asset, description: "", confidence: "high", sources: [] }) as unknown as AssetRelation;

describe("the chosen asset's bonds, spoken", () => {
  const emir = summary("emir-hani", "Emir Hanı", 40.1853, 29.0631);
  const koza = summary("koza-hani", "Koza Hanı", 40.1836, 29.0628);
  const far = summary("istanbul-x", "İstanbul'daki külliye", 41.0, 28.9);

  it("tells each related asset on the map, what joins them and where", () => {
    const spoken = bondsSpoken(ulucami, [relation(emir, "waqf_income", "Vakıf geliri"), relation(koza, "urban_context", "Kentsel bağlam")], new Set(["emir-hani", "koza-hani"]));
    expect(spoken).toBe("Haritada 2 bağı var. Emir Hanı: Vakıf geliri, 200 m kuzeydoğu yönünde; Koza Hanı: Kentsel bağlam, 100 m güneydoğu yönünde.");
  });

  it("joins the ways two assets are related into one entry", () => {
    const spoken = bondsSpoken(ulucami, [relation(emir, "waqf_income", "Vakıf geliri"), relation(emir, "same_founder", "Aynı bani")], new Set(["emir-hani"]));
    expect(spoken).toBe("Haritada 1 bağı var. Emir Hanı: Aynı bani, Vakıf geliri, 200 m kuzeydoğu yönünde.");
  });

  it("leaves out what is not on this map, and says nothing without bonds", () => {
    expect(bondsSpoken(ulucami, [relation(far, "waqf_income", "Vakıf geliri")], new Set(["emir-hani"]))).toBeNull();
    expect(bondsSpoken(ulucami, [], new Set())).toBeNull();
  });

  it("counts a building by its complex on the map", () => {
    const building = summary("muradiye-camii", "Muradiye Camii", 40.1855, 29.0631, "emir-hani");
    expect(bondsSpoken(ulucami, [relation(building, "same_founder", "Aynı bani")], new Set(["emir-hani"]))).toContain("Muradiye Camii");
  });
});
