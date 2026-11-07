import { JOURNAL_STROKES_MAX_CHARS, JournalLayoutSchema, JournalStrokeSchema } from "@vagabonds/contracts";
import { describe, expect, it } from "vitest";

import { decodeStroke, encodeStroke, hasRoomFor, linePath, penWidth, simplifyLine, strokeAt, strokesBottom } from "../src/lib/journal-drawing";

const WIDTH = 346;
const stroke = (points: { x: number; y: number }[]) => ({ color: "ink" as const, size: "thin" as const, d: encodeStroke(points, WIDTH) });

describe("drawing on a journal page", () => {
  it("stores a line briefly and in the form the API takes, and reads it back to within a point", () => {
    const line = [{ x: 40, y: 80 }, { x: 43.2, y: 78.1 }, { x: 47, y: 78 }, { x: 40, y: 200 }];
    const d = encodeStroke(line, WIDTH);
    expect(JournalStrokeSchema.safeParse({ color: "ink", size: "thin", d }).success).toBe(true);
    decodeStroke(d, WIDTH).forEach((point, at) => {
      expect(Math.abs(point.x - line[at]!.x)).toBeLessThan(1);
      expect(Math.abs(point.y - line[at]!.y)).toBeLessThan(1);
    });
  });

  it("looks the same on a page of another width", () => {
    const d = encodeStroke([{ x: 173, y: 100 }], WIDTH);
    expect(decodeStroke(d, WIDTH * 2)[0]!.x).toBeCloseTo(346, 0);
  });

  it("keeps a straight line in two points, and every turn of a bent one", () => {
    const straight = Array.from({ length: 200 }, (_, at) => ({ x: at, y: at }));
    expect(simplifyLine(straight)).toHaveLength(2);
    const bent = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
    expect(simplifyLine(bent)).toEqual(bent);
  });

  it("does not overflow the stack on a very long line", () => {
    const long = Array.from({ length: 50_000 }, (_, at) => ({ x: at % 300, y: (at * 7) % 300 }));
    expect(simplifyLine(long).length).toBeGreaterThan(2);
  });

  it("makes a tap a dot, and a line a path", () => {
    expect(linePath([{ x: 1, y: 2 }])).toMatch(/^M1 2L/);
    expect(linePath([])).toBe("");
    expect(linePath([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }])).toContain("Q");
  });

  it("finds the line under the rubber, the latest first, and none when far off", () => {
    const low = stroke([{ x: 10, y: 100 }, { x: 200, y: 100 }]);
    const high = stroke([{ x: 100, y: 10 }, { x: 100, y: 200 }]);
    expect(strokeAt([low, high], { x: 100, y: 100 }, WIDTH)).toBe(1);
    expect(strokeAt([low, high], { x: 30, y: 104 }, WIDTH)).toBe(0);
    expect(strokeAt([low, high], { x: 300, y: 300 }, WIDTH)).toBe(-1);
    expect(strokeAt([], { x: 0, y: 0 }, WIDTH)).toBe(-1);
  });

  it("knows how low the drawing goes", () => {
    expect(strokesBottom([stroke([{ x: 0, y: 40 }, { x: 0, y: 300 }])], WIDTH)).toBeCloseTo(300, -1);
    expect(strokesBottom([], WIDTH)).toBe(0);
  });

  it("says when a page has no room left, at the same limit as the API", () => {
    const half = { color: "ink" as const, size: "thin" as const, d: "1,1 ".repeat(JOURNAL_STROKES_MAX_CHARS / 8).trim() };
    expect(hasRoomFor([half], half.d)).toBe(true);
    expect(hasRoomFor([half, half], "1,1")).toBe(false);
    const text = { x: 0, y: 0, width: 1, z: 1 };
    expect(JournalLayoutSchema.safeParse({ photos: [], text, strokes: [half, half, { ...half, d: "1,1" }] }).success).toBe(false);
    // Pages arranged before drawing could be done still read.
    expect(JournalLayoutSchema.parse({ photos: [], text }).strokes).toEqual([]);
  });

  it("gives the pen the same weight on a larger page", () => {
    expect(penWidth("thick", WIDTH * 2)).toBeCloseTo(penWidth("thick", WIDTH) * 2);
    expect(penWidth("thin", WIDTH)).toBeLessThan(penWidth("thick", WIDTH));
  });
});
