/**
 * Ziyaret Mührü's alignment: whether the monument, as the camera tracks it, lies where the ghost
 * photo shows it. Loose on purpose: the photographer's lens and the phone's differ, so the same
 * spot does not give the same size; standing near it and facing the same way is what counts.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Which way to move the phone, or null when it lines up. */
export type AlignHint = "closer" | "farther" | "left" | "right" | "up" | "down";

/** The tracked monument may be this much smaller or larger than the ghost and still line up. */
const SCALE_MIN = 0.65;
const SCALE_MAX = 1.5;
/** Its middle may be this far from the ghost's, as a share of the screen's width and height. */
const OFFSET_MAX = 0.15;

/**
 * Where the photo lies on the screen: whole, as large as fits, in the middle (`AssetImage` with
 * `fit="contain"`). Whole, not cropped to fill: the tracker needs most of the monument in view, so
 * the photo lined up has to be on the screen, not past its edges.
 */
export function ghostRect(screen: Size, photo: Size): Rect {
  const scale = Math.min(screen.width / photo.width, screen.height / photo.height);
  const width = photo.width * scale;
  const height = photo.height * scale;
  return { left: (screen.width - width) / 2, top: (screen.height - height) / 2, width, height };
}

function area(corners: ReadonlyArray<readonly [number, number]>): number {
  let twice = 0;
  for (let i = 0; i < corners.length; i++) {
    const [x1, y1] = corners[i]!;
    const [x2, y2] = corners[(i + 1) % corners.length]!;
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/**
 * How the tracked monument (its four corners, in screen points) sits against the ghost: lined up,
 * or the one move that helps most, size first. `scale` above 1 means it shows larger than the ghost.
 */
export function alignment(corners: ReadonlyArray<readonly [number, number]>, ghost: Rect, screen: Size): { aligned: boolean; hint: AlignHint | null; scale: number } {
  const scale = Math.sqrt(area(corners) / (ghost.width * ghost.height));
  const middle = corners.reduce(([sx, sy], [x, y]) => [sx + x / corners.length, sy + y / corners.length], [0, 0]);
  const dx = (middle[0] - (ghost.left + ghost.width / 2)) / screen.width;
  const dy = (middle[1] - (ghost.top + ghost.height / 2)) / screen.height;

  let hint: AlignHint | null = null;
  if (!(scale >= SCALE_MIN)) hint = "closer";
  else if (scale > SCALE_MAX) hint = "farther";
  // The monument shows right of where it should: turning the phone right brings it back.
  else if (Math.abs(dx) > OFFSET_MAX && Math.abs(dx) >= Math.abs(dy)) hint = dx > 0 ? "right" : "left";
  else if (Math.abs(dy) > OFFSET_MAX) hint = dy > 0 ? "down" : "up";
  else if (Math.abs(dx) > OFFSET_MAX) hint = dx > 0 ? "right" : "left";
  return { aligned: hint === null, hint, scale };
}
