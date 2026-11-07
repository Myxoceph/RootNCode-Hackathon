import { describe, expect, it } from "vitest";

import { kmBetween } from "../src/map/dense-area";
import { spreadPlaces } from "../src/map/spread";

// Hoca İlyas Ortaokulu and Veled-i Sarayi Mescidi: one neighbourhood centre for both.
const centre = { lat: 40.18518, lng: 29.06036 };
const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => kmBetween(a, b) * 1000;

describe("spreadPlaces", () => {
  it("keeps places alone where they are", () => {
    const at = spreadPlaces([
      { id: "a", ...centre, approximate: true },
      { id: "b", lat: 40.19, lng: 29.07, approximate: false },
    ]);
    expect(at.get("a")).toEqual(centre);
    expect(at.get("b")).toEqual({ lat: 40.19, lng: 29.07 });
  });

  it("draws places on one spot apart, around it", () => {
    const at = spreadPlaces([
      { id: "okul", ...centre, approximate: true },
      { id: "mescit", ...centre, approximate: true },
    ]);
    const [a, b] = [at.get("okul")!, at.get("mescit")!];
    expect(meters(a, b)).toBeCloseTo(30, 0);
    expect(meters(a, centre)).toBeCloseTo(15, 0);
    expect(meters(b, centre)).toBeCloseTo(15, 0);
  });

  it("pushes two exact places a few metres apart to a seal's width, each keeping its side", () => {
    // Zağferanlık Mescidi and Bekir Dede Türbesi, 17 m apart.
    const mescit = { id: "mescit", lat: 40.1861, lng: 29.0577, approximate: false };
    const turbe = { id: "turbe", lat: 40.18625, lng: 29.0577, approximate: false };
    const at = spreadPlaces([mescit, turbe]);
    const [m, t] = [at.get("mescit")!, at.get("turbe")!];
    expect(meters(m, t)).toBeGreaterThanOrEqual(29.5);
    // The tomb is still north of the mosque.
    expect(t.lat).toBeGreaterThan(m.lat);
    expect(meters(m, mescit)).toBeLessThan(10);
  });

  it("leaves the one exact place where it is and moves the approximate ones round it", () => {
    const karatay = { lat: 37.87503, lng: 32.4929 };
    const at = spreadPlaces([
      { id: "karatay", ...karatay, approximate: false },
      { id: "kemaliye", lat: 37.87503, lng: 32.49291, approximate: true },
    ]);
    expect(at.get("karatay")).toEqual(karatay);
    expect(meters(at.get("kemaliye")!, karatay)).toBeCloseTo(30, 0);
  });

  it("is the same every time, whatever the order", () => {
    const places = [
      { id: "b", ...centre, approximate: true },
      { id: "a", ...centre, approximate: true },
      { id: "c", ...centre, approximate: true },
    ];
    expect(spreadPlaces(places)).toEqual(spreadPlaces([...places].reverse()));
  });
});
