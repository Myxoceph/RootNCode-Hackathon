import { describe, expect, it } from "vitest";

import { alignment, ghostRect, type Rect } from "../src/lib/seal-alignment";

const screen = { width: 400, height: 800 };

/** The corners of a rectangle, as the tracker gives them. */
const quad = ({ left, top, width, height }: Rect): Array<[number, number]> => [
  [left, top],
  [left + width, top],
  [left + width, top + height],
  [left, top + height],
];

const moved = (rect: Rect, dx: number, dy: number, scale = 1): Rect => {
  const width = rect.width * scale;
  const height = rect.height * scale;
  return { left: rect.left + rect.width / 2 - width / 2 + dx, top: rect.top + rect.height / 2 - height / 2 + dy, width, height };
};

describe("ghostRect", () => {
  it("shows the whole photo, as large as fits, in the middle", () => {
    const wide = ghostRect(screen, { width: 1200, height: 800 });
    expect([wide.left, wide.top, wide.width, wide.height].map(Math.round)).toEqual([0, 267, 400, 267]);
    expect(ghostRect(screen, { width: 600, height: 1600 })).toEqual({ left: 50, top: 0, width: 300, height: 800 });
  });
});

describe("alignment", () => {
  const ghost = ghostRect(screen, { width: 1200, height: 800 });

  it("lines up on the ghost, and a little off it", () => {
    expect(alignment(quad(ghost), ghost, screen)).toMatchObject({ aligned: true, hint: null });
    expect(alignment(quad(moved(ghost, 40, -60, 1.2)), ghost, screen).aligned).toBe(true);
  });

  it("asks for size first: closer when the monument shows small, farther when it shows large", () => {
    expect(alignment(quad(moved(ghost, 200, 0, 0.4)), ghost, screen).hint).toBe("closer");
    expect(alignment(quad(moved(ghost, 0, 0, 2)), ghost, screen).hint).toBe("farther");
  });

  it("turns the phone towards where the monument shows", () => {
    expect(alignment(quad(moved(ghost, 120, 0)), ghost, screen).hint).toBe("right");
    expect(alignment(quad(moved(ghost, -120, 0)), ghost, screen).hint).toBe("left");
    expect(alignment(quad(moved(ghost, 0, 200)), ghost, screen).hint).toBe("down");
    expect(alignment(quad(moved(ghost, 0, -200)), ghost, screen).hint).toBe("up");
  });
});
