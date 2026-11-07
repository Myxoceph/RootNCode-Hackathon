import { describe, expect, it } from "vitest";

import { messages } from "../src/i18n/messages";
import {
  autoLayout,
  compactLayout,
  duplicateSticker,
  moveItem,
  placementsFor,
  placeNewPhoto,
  placeSticker,
  printHeight,
  printTilt,
  resizePhoto,
  resizeSticker,
  resizeText,
  snapToCentre,
  stickersBottom,
  textTop,
  textWidth,
  turnItem,
} from "../src/lib/journal-layout";
import { emptyHistory, record, redo, undo } from "../src/lib/journal-history";
import { STICKER_GROUPS, STICKER_IDS, stickerArt } from "../src/lib/journal-stickers";

const room = { left: 0.13, right: 0.93, width: 346 };
const placed = { id: "a", x: 0.2, y: 0.3, width: 0.5, rotation: 0, z: 1 };

describe("arranging a journal page", () => {
  it("starts tidy: one photo large, more in rows of two, the text below them all", () => {
    const one = autoLayout([{ id: "a", aspect: 1 }], room);
    const three = autoLayout([{ id: "a", aspect: 1 }, { id: "b", aspect: 1.5 }, { id: "c", aspect: 0.8 }], room);
    expect(one.photos[0]!.width).toBeGreaterThan(three.photos[0]!.width);
    expect(three.photos[0]!.y).toBe(three.photos[1]!.y);
    expect(three.photos[2]!.y).toBeGreaterThan(three.photos[0]!.y);
    const last = three.photos[2]!;
    expect(three.text.y).toBeGreaterThan(last.y + printHeight(last.width, 0.8, room.width));
    expect(autoLayout([], room).text.y).toBe(0);
  });

  it("puts a new photo on top without moving what was placed", () => {
    const layout = { photos: [{ ...placed, x: 0.6 }], text: { x: 0.1, y: 1, width: 0.7, z: 5 }, strokes: [], stickers: [] };
    const next = placeNewPhoto(layout, { id: "b", aspect: 1 }, room);
    expect(next.photos[0]).toEqual(layout.photos[0]);
    expect(next.photos[1]!.z).toBe(6);
  });

  it("draws only what the page has, and finds room below for what the layout does not name", () => {
    const layout = { photos: [placed, { ...placed, id: "gone" }], text: { x: 0.1, y: 0.2, width: 0.7, z: 1 }, strokes: [], stickers: [] };
    const out = placementsFor(layout, [{ id: "a", aspect: 1 }, { id: "new", aspect: 1 }], room);
    expect(out.map((one) => one.id)).toEqual(["a", "new"]);
    expect(out[1]!.y).toBeGreaterThan(placed.y + printHeight(placed.width, 1, room.width));
  });

  it("keeps a dragged photo at least half on the page", () => {
    expect(moveItem(placed, 5, 0).x).toBeCloseTo(0.75);
    expect(moveItem(placed, -5, 0).x).toBeCloseTo(-0.25);
    expect(moveItem(placed, 0, -5).y).toBeGreaterThanOrEqual(-0.05);
  });

  it("sizes a photo about its centre, within limits", () => {
    const larger = resizePhoto(placed, 0.7);
    expect(larger.width).toBeCloseTo(0.7);
    expect(larger.x + larger.width / 2).toBeCloseTo(placed.x + placed.width / 2);
    expect(resizePhoto(placed, 0.01).width).toBeCloseTo(0.18);
    expect(resizePhoto(placed, 9).width).toBeCloseTo(1);
  });

  it("wraps a turn, and takes nearly straight as straight", () => {
    expect(turnItem(placed, 190).rotation).toBeCloseTo(-170);
    expect(turnItem(placed, -190).rotation).toBeCloseTo(170);
    expect(turnItem(placed, 1).rotation).toBe(0);
    expect(turnItem(placed, 20).rotation).toBe(20);
  });

  it("keeps the text on the page and on the lines", () => {
    expect(resizeText({ x: 0.6, y: 0, width: 0.4, z: 0 }, 0.9).width).toBeCloseTo(0.4);
    expect(textTop(0.5, 320, 32) % 32).toBe(0);
    expect(textTop(0.52, 320, 32)).toBe(160);
  });

  it("narrows the text to stay on the page, and gives its width back", () => {
    expect(textWidth({ x: 0.5, y: 0, width: 0.8, z: 0 })).toBeCloseTo(0.5);
    expect(textWidth({ x: 0.1, y: 0, width: 0.8, z: 0 })).toBeCloseTo(0.8);
  });

  it("saves no more digits than anyone can see, and stays valid", () => {
    const out = compactLayout({ photos: [{ ...placed, x: 0.123456789, rotation: 12.3456 }], text: { x: 0.1111111, y: 1, width: 0.5, z: 1 }, strokes: [{ color: "ink", size: "thin", d: "1,2" }], stickers: [{ id: "s", sticker: "cat", x: 0.123456789, y: 0.2, width: 0.3, rotation: 4.56, z: 2 }] });
    expect(out.photos[0]).toMatchObject({ x: 0.1235, rotation: 12.3 });
    expect(out.text.x).toBe(0.1111);
    expect(out.strokes).toHaveLength(1);
    expect(out.stickers[0]).toMatchObject({ x: 0.1235, rotation: 4.6 });
  });

  it("puts a new sticker on top, in view, and each one off the last", () => {
    const empty = autoLayout([{ id: "a", aspect: 1 }], room);
    const one = placeSticker(empty, "s1", "cat", 1, 1.6);
    const two = placeSticker(one, "s2", "tea", 1, 1.6);
    const [first, second] = two.stickers;
    expect(first!.z).toBeGreaterThan(empty.photos[0]!.z);
    expect(second!.z).toBeGreaterThan(first!.z);
    expect(first!.y).toBeGreaterThan(1);
    expect(first!.y + first!.width).toBeLessThan(2.6);
    expect([second!.x, second!.y]).not.toEqual([first!.x, first!.y]);
    expect(Math.abs(first!.rotation)).toBeLessThanOrEqual(7.5);
  });

  it("sizes a sticker about its centre, smaller than a photo may go, and knows how low they reach", () => {
    const sticker = { id: "s", sticker: "cat", x: 0.3, y: 0.3, width: 0.3, rotation: 0, z: 1 };
    const larger = resizeSticker(sticker, 0.4);
    expect(larger.x + larger.width / 2).toBeCloseTo(0.45);
    expect(resizeSticker(sticker, 0.01).width).toBeCloseTo(0.1);
    expect(resizeSticker(sticker, 9).width).toBeCloseTo(0.7);
    expect(stickersBottom([sticker], 300)).toBeCloseTo(180);
    expect(stickersBottom([], 300)).toBe(0);
  });

  it("tilts a print the same way each time, and only a little", () => {
    expect(printTilt("abc")).toBe(printTilt("abc"));
    for (const id of ["a", "0b9f6c2e-6d0e", "zzzzzzzz"]) expect(Math.abs(printTilt(id))).toBeLessThanOrEqual(2.5);
  });
});

describe("the journal's stickers", () => {
  it("shows every sticker in exactly one group, and has a drawing and a name for each", () => {
    const shown = Object.values(STICKER_GROUPS).flat() as string[];
    expect([...shown].sort()).toEqual([...STICKER_IDS].sort());
    for (const lang of [messages.tr, messages.en]) {
      for (const id of STICKER_IDS) {
        expect(stickerArt(id)!.length).toBeGreaterThan(0);
        expect(lang.journal.arrange.stickerNames[id]).toBeTruthy();
      }
    }
  });

  it("has an outline to cut round on each, and no broken numbers in its paths", () => {
    for (const id of STICKER_IDS) {
      const shapes = stickerArt(id)!;
      expect(shapes.some((shape) => shape.edge)).toBe(true);
      for (const shape of shapes) expect(shape.d).not.toMatch(/NaN|undefined/);
    }
  });

  it("draws nothing for a sticker this version does not know, even one named like a built-in", () => {
    expect(stickerArt("from-a-later-version")).toBeNull();
    expect(stickerArt("constructor")).toBeNull();
  });
});

describe("arranging by hand: the guide and the copy", () => {
  it("draws what comes close to the page's middle onto it, and leaves the rest alone", () => {
    expect(snapToCentre(0.36, 0.3)).toEqual({ x: 0.35, snapped: true });
    expect(snapToCentre(0.1, 0.3)).toEqual({ x: 0.1, snapped: false });
  });

  it("copies a sticker on top and off the first, under its own id", () => {
    const layout = { photos: [], text: { x: 0, y: 0, width: 1, z: 3 }, strokes: [], stickers: [{ id: "a", sticker: "cat", x: 0.2, y: 0.2, width: 0.3, rotation: 5, z: 1 }] };
    const copy = duplicateSticker(layout, "a", "b").stickers[1]!;
    expect(copy).toMatchObject({ id: "b", sticker: "cat", width: 0.3, rotation: 5, z: 4 });
    expect(copy.x).toBeGreaterThan(0.2);
    expect(duplicateSticker(layout, "gone", "b")).toBe(layout);
  });
});

describe("going back and forward while arranging", () => {
  it("goes back, forward again, and forgets the way forward after a new step", () => {
    let history = record(emptyHistory<number>(), 1);
    const back = undo(history, 2)!;
    expect(back.value).toBe(1);
    const forward = redo(back.history, 1)!;
    expect(forward.value).toBe(2);
    history = record(back.history, 1);
    expect(history.future).toEqual([]);
    expect(redo(history, 3)).toBeNull();
  });

  it("has nowhere to go at either end, and keeps only so many steps", () => {
    expect(undo(emptyHistory<number>(), 1)).toBeNull();
    expect(redo(emptyHistory<number>(), 1)).toBeNull();
    let history = emptyHistory<number>();
    for (let step = 0; step < 80; step++) history = record(history, step);
    expect(history.past).toHaveLength(50);
    expect(history.past.at(-1)).toBe(79);
  });
});
