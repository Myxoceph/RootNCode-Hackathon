import type { JournalLayout, JournalPhotoPlacement, JournalStickerPlacement, JournalTextPlacement } from "@vagabonds/contracts";

/** A photo to be placed: its id and its shape. */
export interface PlaceablePhoto {
  id: string;
  /** Width over height. */
  aspect: number;
}

/** The white border round a print, in points; the same in the book and while arranging. */
export const PRINT_BORDER = 7;
const MIN_PHOTO_WIDTH = 0.18;
const MAX_PHOTO_WIDTH = 1;
const MIN_STICKER_WIDTH = 0.1;
const MAX_STICKER_WIDTH = 0.7;
const NEW_STICKER_WIDTH = 0.28;
/** How far a copy lands from its sticker, in shares of the page. */
const STICKER_STEP = 0.05;
/** Where new stickers land round the middle of the view, in turn: one on another would hide it. */
const STICKER_SPOTS = [[0, 0], [-0.22, -0.16], [0.22, -0.1], [-0.2, 0.18], [0.2, 0.2]] as const;
/** How close to the page's middle a dragged thing is drawn to it, in shares of the page. */
const SNAP_WITHIN = 0.015;
const MIN_TEXT_WIDTH = 0.3;
const MAX_TEXT_WIDTH = 1;
const MAX_Y = 12;
/** A turn this close to straight is taken as straight. */
const STRAIGHT_WITHIN = 1.5;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** The page's room, in shares of its width: `left` is where writing starts, `right` where it ends. */
export interface PageRoom {
  left: number;
  right: number;
  /** The page's width in points: the print's border does not grow with it. */
  width: number;
}

/** A print's whole height, in shares of the page's width. */
export function printHeight(photoWidth: number, aspect: number, pageWidth: number): number {
  const border = PRINT_BORDER * 2;
  return ((photoWidth * pageWidth - border) / aspect + border) / pageWidth;
}

/** A small tilt that stays with the photo: prints pasted by hand are never quite straight. */
export function printTilt(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 50) - 25) / 10;
}

/** Where things lie before the visitor moves them: one photo wide, more in rows of two, the text below. */
export function autoLayout(photos: readonly PlaceablePhoto[], room: PageRoom): JournalLayout {
  const column = room.right - room.left;
  const gap = 0.05;
  const width = photos.length === 1 ? column * 0.82 : (column - gap) / 2;
  let top = 0.04;
  const placed: JournalPhotoPlacement[] = [];
  for (let row = 0; row < photos.length; row += 2) {
    const pair = photos.slice(row, row + 2);
    let tallest = 0;
    pair.forEach((photo, at) => {
      placed.push({ id: photo.id, x: room.left + at * (width + gap), y: top, width, rotation: printTilt(photo.id), z: placed.length + 1 });
      tallest = Math.max(tallest, printHeight(width, photo.aspect, room.width));
    });
    top += tallest + gap;
  }
  return { photos: placed, text: { x: room.left, y: photos.length > 0 ? top : 0, width: column, z: placed.length + 1 }, strokes: [], stickers: [] };
}

/** A photo added to a page already arranged: on top, a step down from the last one, so it can be seen. */
export function placeNewPhoto(layout: JournalLayout, photo: PlaceablePhoto, room: PageRoom): JournalLayout {
  const step = 0.06 * layout.photos.length;
  const width = (room.right - room.left) * 0.6;
  const placement: JournalPhotoPlacement = { id: photo.id, x: room.left + step, y: 0.04 + step, width, rotation: printTilt(photo.id), z: topZ(layout) + 1 };
  return { ...layout, photos: [...layout.photos, placement] };
}

/**
 * Everything on a page, for what is on it right now: photos the layout names but the page no longer
 * has are dropped, and those it does not name yet go below what is there.
 */
export function placementsFor(layout: JournalLayout, photos: readonly PlaceablePhoto[], room: PageRoom): JournalPhotoPlacement[] {
  const known = layout.photos.filter((placement) => photos.some((photo) => photo.id === placement.id));
  let bottom = known.reduce((low, placement) => {
    const photo = photos.find((one) => one.id === placement.id)!;
    return Math.max(low, placement.y + printHeight(placement.width, photo.aspect, room.width));
  }, Math.max(0, layout.text.y));
  const width = (room.right - room.left) * 0.6;
  const extra = photos
    .filter((photo) => !known.some((placement) => placement.id === photo.id))
    .map((photo, at) => {
      const placement: JournalPhotoPlacement = { id: photo.id, x: room.left, y: bottom + 0.05, width, rotation: printTilt(photo.id), z: topZ(layout) + at + 1 };
      bottom = placement.y + printHeight(width, photo.aspect, room.width);
      return placement;
    });
  return [...known, ...extra];
}

export const topZ = (layout: JournalLayout) => Math.max(layout.text.z, ...layout.photos.map((photo) => photo.z), ...layout.stickers.map((sticker) => sticker.z), 0);

/** What lies freely on a page: a photo or a sticker. */
type Placed = JournalPhotoPlacement | JournalStickerPlacement;

/** At a new place, with at least half of it left on the page. */
export function moveItem<T extends Placed>(item: T, x: number, y: number): T {
  return { ...item, x: clamp(x, -item.width / 2, 1 - item.width / 2), y: clamp(y, -0.05, MAX_Y) };
}

function resizeItem<T extends Placed>(item: T, width: number, low: number, high: number): T {
  const next = clamp(width, low, high);
  return moveItem({ ...item, width: next }, item.x + (item.width - next) / 2, item.y + (item.width - next) / 2);
}

/** A photo at a new size, about its own centre. */
export const resizePhoto = (photo: JournalPhotoPlacement, width: number) => resizeItem(photo, width, MIN_PHOTO_WIDTH, MAX_PHOTO_WIDTH);

/** A sticker at a new size, about its own centre. It can go smaller than a photo: a small one in a corner. */
export const resizeSticker = (sticker: JournalStickerPlacement, width: number) => resizeItem(sticker, width, MIN_STICKER_WIDTH, MAX_STICKER_WIDTH);

/** Turned, between -180 and 180 degrees; nearly straight is straight. */
export function turnItem<T extends Placed>(item: T, rotation: number): T {
  const wrapped = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return { ...item, rotation: Math.abs(wrapped) < STRAIGHT_WITHIN ? 0 : wrapped };
}

/**
 * A new sticker: in the middle of what is in view (`viewTop`, `viewHeight` in shares of the page's width),
 * on top of everything, a little crooked as anything stuck on by hand is, and off the last one.
 */
export function placeSticker(layout: JournalLayout, id: string, sticker: string, viewTop: number, viewHeight: number): JournalLayout {
  const [spotX, spotY] = STICKER_SPOTS[layout.stickers.length % STICKER_SPOTS.length]!;
  const x = 0.5 - NEW_STICKER_WIDTH / 2 + spotX;
  const y = viewTop + viewHeight / 2 - NEW_STICKER_WIDTH / 2 + spotY;
  const placement = moveItem<JournalStickerPlacement>(
    { id, sticker, x, y, width: NEW_STICKER_WIDTH, rotation: printTilt(id) * 3, z: topZ(layout) + 1 },
    x,
    y,
  );
  return { ...layout, stickers: [...layout.stickers, placement] };
}

/** Another of the same sticker, on top and a little off the first, so it can be seen. */
export function duplicateSticker(layout: JournalLayout, id: string, newId: string): JournalLayout {
  const source = layout.stickers.find((one) => one.id === id);
  if (!source) return layout;
  const copy = moveItem({ ...source, id: newId, z: topZ(layout) + 1 }, source.x + STICKER_STEP, source.y + STICKER_STEP);
  return { ...layout, stickers: [...layout.stickers, copy] };
}

/** A dragged thing's left edge, drawn to the middle of the page when it comes close: `snapped` shows the guide. */
export function snapToCentre(x: number, width: number): { x: number; snapped: boolean } {
  const centred = 0.5 - width / 2;
  return Math.abs(x - centred) < SNAP_WITHIN ? { x: centred, snapped: true } : { x, snapped: false };
}

/** How far down the page the stickers go, in points. */
export function stickersBottom(stickers: readonly JournalStickerPlacement[], pageWidth: number): number {
  return stickers.reduce((low, sticker) => Math.max(low, (sticker.y + sticker.width) * pageWidth), 0);
}

export function moveText(text: JournalTextPlacement, x: number, y: number): JournalTextPlacement {
  return { ...text, x: clamp(x, 0, 1 - MIN_TEXT_WIDTH), y: clamp(y, 0, MAX_Y) };
}

export function resizeText(text: JournalTextPlacement, width: number): JournalTextPlacement {
  return { ...text, width: clamp(width, MIN_TEXT_WIDTH, Math.min(MAX_TEXT_WIDTH, 1 - text.x)) };
}

/** The text's width as drawn: it narrows to stay on the page, and has its width back when moved left again. */
export const textWidth = (text: JournalTextPlacement) => Math.min(text.width, 1 - text.x);

/** On the lines, whatever was stored: where the text's top falls on a page with lines this far apart. */
export function textTop(y: number, pageWidth: number, line: number): number {
  return Math.round((y * pageWidth) / line) * line;
}

/** Without more digits than anyone can see, for what is saved. */
export function compactLayout(layout: JournalLayout): JournalLayout {
  const round = (value: number, digits = 4) => Number(value.toFixed(digits));
  return {
    photos: layout.photos.map((photo) => ({ ...photo, x: round(photo.x), y: round(photo.y), width: round(photo.width), rotation: round(photo.rotation, 1) })),
    text: { ...layout.text, x: round(layout.text.x), y: round(layout.text.y), width: round(layout.text.width) },
    strokes: layout.strokes,
    stickers: layout.stickers.map((sticker) => ({ ...sticker, x: round(sticker.x), y: round(sticker.y), width: round(sticker.width), rotation: round(sticker.rotation, 1) })),
  };
}
