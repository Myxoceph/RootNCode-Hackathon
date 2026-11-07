/**
 * The geometry of a seal's impression in ink: the round, bumpy edge a pressed seal leaves, the beads
 * inside it, the worn spots where the stamp did not take ink, and the ink that soaks past the edge.
 * Pure and deterministic, so every seal of a monument looks the same and the drawing is tested.
 */

export type Dot = { x: number; y: number; r: number };

/** A round edge in small bumps, as a pressed seal has; an SVG path. */
export function scallopPath(cx: number, cy: number, radius: number, bumps: number): string {
  const step = (Math.PI * 2) / bumps;
  const bump = radius * Math.sin(step / 2) * 1.05;
  const at = (i: number) => `${(cx + radius * Math.cos(i * step)).toFixed(1)} ${(cy + radius * Math.sin(i * step)).toFixed(1)}`;
  const arcs = Array.from({ length: bumps }, (_unused, i) => `A${bump.toFixed(1)} ${bump.toFixed(1)} 0 0 1 ${at(i + 1)}`);
  return `M${at(0)}${arcs.join("")}Z`;
}

/** An eight-pointed star, the mark of a foundation's seal; an SVG path. */
export function starPath(cx: number, cy: number, outer: number, inner: number, points = 8): string {
  const corners = Array.from({ length: points * 2 }, (_unused, at) => {
    const radius = at % 2 === 0 ? outer : inner;
    const angle = (Math.PI * at) / points - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M${corners.join("L")}Z`;
}

/** Evenly spaced beads round a circle. */
export function beads(cx: number, cy: number, radius: number, count: number, size: number): Dot[] {
  return Array.from({ length: count }, (_unused, i) => {
    const angle = (Math.PI * 2 * i) / count;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), r: size };
  });
}

/** A small seeded random, so the same name always wears the same way. */
function random(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

/** Spots inside the impression where the stamp took no ink: `count` of them, between `from` and `to` from the centre. */
export function wornSpots(seed: string, cx: number, cy: number, from: number, to: number, count: number): Dot[] {
  const next = random(`worn:${seed}`);
  return Array.from({ length: count }, () => {
    const angle = next() * Math.PI * 2;
    const distance = from + next() * (to - from);
    return { x: cx + distance * Math.cos(angle), y: cy + distance * Math.sin(angle), r: 0.6 + next() * 1.8 };
  });
}

/** Ink soaked past the edge: small blots just outside `radius`, more where the stamp pressed harder. */
export function bleedBlots(seed: string, cx: number, cy: number, radius: number, count: number): Dot[] {
  const next = random(`bleed:${seed}`);
  return Array.from({ length: count }, (_unused, i) => {
    const angle = ((i + next() * 0.8) / count) * Math.PI * 2;
    const distance = radius + next() * 3;
    return { x: cx + distance * Math.cos(angle), y: cy + distance * Math.sin(angle), r: 1.5 + next() * 2.5 };
  });
}
