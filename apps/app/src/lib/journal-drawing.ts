import { JOURNAL_STROKES_MAX, JOURNAL_STROKES_MAX_CHARS, type JournalStroke, type JournalStrokeColor, type JournalStrokeSize } from "@vagabonds/contracts";

export interface Point {
  x: number;
  y: number;
}

/** How far apart, in points, two points are kept while drawing; and what may be smoothed away after. */
export const POINT_EVERY = 2.5;
const SMOOTH_WITHIN = 0.7;
/** The page these sizes are drawn for: pens grow with the page, so a page looks alike on any screen. */
const PEN_PAGE = 346;
const PEN_WIDTH: Record<JournalStrokeSize, number> = { thin: 2.4, thick: 5.5 };
/** How near the rubber must come to a line. */
const RUBBER_REACH = 12;
const UNITS = 1000;

export const STROKE_COLORS: Record<JournalStrokeColor, string> = { ink: "#2A2320", green: "#1F4A3A", red: "#9E2B33", blue: "#254E8C" };

export const penWidth = (size: JournalStrokeSize, pageWidth: number) => (PEN_WIDTH[size] * pageWidth) / PEN_PAGE;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Fewer points for the same line (Ramer-Douglas-Peucker), without recursion: a long line must not overflow the stack. */
export function simplifyLine(points: readonly Point[], within = SMOOTH_WITHIN): Point[] {
  if (points.length < 3) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const spans: Array<[number, number]> = [[0, points.length - 1]];
  while (spans.length > 0) {
    const [from, to] = spans.pop()!;
    let furthest = -1;
    let most = within;
    for (let at = from + 1; at < to; at++) {
      const off = distanceToSegment(points[at]!, points[from]!, points[to]!);
      if (off > most) {
        most = off;
        furthest = at;
      }
    }
    if (furthest !== -1) {
      keep[furthest] = true;
      spans.push([from, furthest], [furthest, to]);
    }
  }
  return points.filter((_point, at) => keep[at]);
}

/** A line in points on a page this wide, as it is stored: see `JournalStrokeSchema`. */
export function encodeStroke(points: readonly Point[], pageWidth: number): string {
  let lastX = 0;
  let lastY = 0;
  return points
    .map((point) => {
      const x = Math.round((point.x / pageWidth) * UNITS);
      const y = Math.round((point.y / pageWidth) * UNITS);
      const part = `${x - lastX},${y - lastY}`;
      lastX = x;
      lastY = y;
      return part;
    })
    .join(" ");
}

export function decodeStroke(d: string, pageWidth: number): Point[] {
  let x = 0;
  let y = 0;
  return d.split(" ").map((part) => {
    const [dx, dy] = part.split(",");
    x += Number(dx);
    y += Number(dy);
    return { x: (x / UNITS) * pageWidth, y: (y / UNITS) * pageWidth };
  });
}

/** An SVG path through the points, rounded at each by running from middle to middle of its neighbours. */
export function linePath(points: readonly Point[]): string {
  const [first, second] = points;
  if (!first) return "";
  // A tap: a line too short to see, which its round ends make a dot.
  if (!second) return `M${first.x} ${first.y}L${first.x + 0.01} ${first.y}`;
  let path = `M${first.x} ${first.y}`;
  for (let at = 1; at < points.length - 1; at++) {
    const point = points[at]!;
    const next = points[at + 1]!;
    path += `Q${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  }
  const last = points[points.length - 1]!;
  return `${path}L${last.x} ${last.y}`;
}

/** The index of the line under the rubber, the latest first; -1 when there is none. */
export function strokeAt(strokes: readonly JournalStroke[], point: Point, pageWidth: number): number {
  for (let at = strokes.length - 1; at >= 0; at--) {
    const line = decodeStroke(strokes[at]!.d, pageWidth);
    for (let i = 0; i < line.length; i++) {
      if (distanceToSegment(point, line[i]!, line[Math.min(i + 1, line.length - 1)]!) <= RUBBER_REACH) return at;
    }
  }
  return -1;
}

/** Where the lowest line ends, in points: the page must reach that far. */
export function strokesBottom(strokes: readonly JournalStroke[], pageWidth: number): number {
  return strokes.reduce((low, stroke) => decodeStroke(stroke.d, pageWidth).reduce((inner, point) => Math.max(inner, point.y), low), 0);
}

/** Whether a line of this size still fits on the page. */
export function hasRoomFor(strokes: readonly JournalStroke[], d: string): boolean {
  if (strokes.length >= JOURNAL_STROKES_MAX) return false;
  return strokes.reduce((sum, stroke) => sum + stroke.d.length, d.length) <= JOURNAL_STROKES_MAX_CHARS;
}
