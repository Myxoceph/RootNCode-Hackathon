import { describe, expect, it } from "vitest";
import { activityPoints, isEarned, progressOf, type UserFacts, type VisitFact } from "../src/modules/achievements/rules.ts";

const at = (hours: number) => new Date(Date.UTC(2026, 9, 30, 9) + hours * 3_600_000);
const visit = (assetId: string, city: string, district: string, type = "cami", era: string | null = null, hours = 0): VisitFact => ({
  assetId,
  city,
  district,
  type,
  era,
  at: at(hours),
  proven: false,
});
const facts = (visits: VisitFact[], extra: Partial<UserFacts> = {}): UserFacts => ({
  visits,
  approved: { notes: 0, photos: 0 },
  pending: { notes: 0, photos: 0 },
  complexChildren: new Map(),
  ...extra,
});

describe("achievement rules", () => {
  const trip = facts([
    visit("a", "bursa", "Osmangazi", "cami", "erken-osmanli", 0),
    visit("b", "bursa", "Osmangazi", "hamam", "erken-osmanli", 1),
    visit("c", "bursa", "Yıldırım", "turbe", null, 3),
    visit("d", "bursa", "İznik", "cami", null, 30),
    visit("e", "konya", "Karatay", "medrese", "selcuklu", 100),
  ]);

  it("counts visits by city, district (any case), types and era", () => {
    expect(progressOf({ kind: "visit_count", count: 2, city: "bursa", district: "osmangazi" }, trip)).toEqual({ current: 2, target: 2 });
    expect(progressOf({ kind: "visit_count", count: 5, types: ["cami", "mescit"] }, trip)).toEqual({ current: 2, target: 5 });
    expect(progressOf({ kind: "visit_count", count: 1, era: "selcuklu" }, trip).current).toBe(1);
    expect(progressOf({ kind: "visit_count", count: 3 }, trip)).toEqual({ current: 3, target: 3 }); // capped
  });

  it("counts different districts and cities", () => {
    expect(progressOf({ kind: "districts", count: 3, city: "bursa" }, trip).current).toBe(3);
    expect(progressOf({ kind: "districts", count: 10 }, trip).current).toBe(4);
    expect(isEarned(progressOf({ kind: "cities", count: 2 }, trip))).toBe(true);
    expect(isEarned(progressOf({ kind: "cities", count: 3 }, trip))).toBe(false);
  });

  it("finds the best run of districts or cities within a time window", () => {
    // Osmangazi and Yıldırım within 3 hours; İznik comes 30 hours after the first.
    expect(progressOf({ kind: "within", level: "district", count: 3, hours: 24 }, trip).current).toBe(2);
    expect(progressOf({ kind: "within", level: "district", count: 3, hours: 30 }, trip).current).toBe(3);
    expect(progressOf({ kind: "within", level: "city", count: 2, hours: 168 }, trip).current).toBe(2);
    expect(progressOf({ kind: "within", level: "city", count: 2, hours: 24 }, trip).current).toBe(1);
  });

  it("completes a complex when every building of it is visited", () => {
    const children = new Map([["k", ["a", "b", "x"]]]);
    expect(progressOf({ kind: "complex", parentId: "k" }, facts(trip.visits, { complexChildren: children }))).toEqual({ current: 2, target: 3 });
    expect(isEarned(progressOf({ kind: "complex", parentId: "empty" }, trip))).toBe(false);
  });

  it("counts approved notes and photos", () => {
    const f = facts([], { approved: { notes: 2, photos: 1 } });
    expect(progressOf({ kind: "contributions", count: 1, contribution: "photos" }, f).current).toBe(1);
    expect(progressOf({ kind: "contributions", count: 5, contribution: "any" }, f).current).toBe(3);
  });
});

describe("proven visits", () => {
  it("counts only proven visits, by city when given", () => {
    const f = facts([{ ...visit("a", "bursa", "Osmangazi"), proven: true }, visit("b", "bursa", "Yıldırım"), { ...visit("c", "konya", "Karatay"), proven: true }]);
    expect(progressOf({ kind: "proven_visits", count: 5 }, f).current).toBe(2);
    expect(progressOf({ kind: "proven_visits", count: 1, city: "konya" }, f)).toEqual({ current: 1, target: 1 });
  });
});

describe("activityPoints", () => {
  it("counts each visit, each seal on top, and approved notes and photos, never pending ones", () => {
    const sealed = { ...visit("a", "konya", "Meram", "cami", null, 0), proven: true };
    const f = facts([sealed, visit("b", "konya", "Meram", "cami", null, 1)], {
      approved: { notes: 3, photos: 1 },
      pending: { notes: 4, photos: 2 },
    });
    expect(activityPoints(f)).toBe(2 * 10 + 10 + 3 * 5 + 10);
    expect(activityPoints(facts([]))).toBe(0);
  });
});
