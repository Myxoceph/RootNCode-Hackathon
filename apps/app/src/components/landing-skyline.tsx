import { useEffect, useRef, type RefObject } from "react";

/**
 * The home page's ground: a skyline of the monuments the app is about (mosques with their domes,
 * half-domes and minarets, a türbe, a han with its row of small domes, a clock tower, cypresses),
 * drawn in gold dots, the outlines brighter than the fill. Two rows of it, a dim one behind and a
 * bright one in front, drift slowly from right to left. They stand on the shore where the laptop
 * stands (`shore`), mirrored in the water under it, the reflection rippling. Under "Hareketi azalt"
 * they stand still.
 *
 * The shapes are drawn once, sampled into dots once and kept as images; a frame only slides them.
 * A canvas, web only; decorative.
 */
export function LandingSkyline({ still, shore }: { still: boolean; shore: RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let layers: Layer[] = [];

    const resize = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = element.clientWidth;
      height = element.clientHeight;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      // The front row reaches well up the screen, its minarets past the middle (on a phone, scaled to the width
      // so more of it shows); the back one is smaller and dimmer, standing a little higher.
      const front = Math.min(1.6, Math.max(0.3, Math.min((height * 0.66) / TILE_H, width / 900)));
      layers = [
        { ...buildLayer(front * 0.7, 3.8, ratio, true), speed: 6, lift: front * 70, alpha: 0.38 },
        { ...buildLayer(front, 4.2, ratio, false), speed: 13, lift: 0, alpha: 1 },
      ];
    };

    const draw = (time: number) => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, element.width, element.height);
      const t = time / 1000;
      // The shore: where the laptop stands, else a little above the bottom.
      const mark = shore.current?.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const line = Math.round((mark && mark.width > 0 ? mark.top - box.top : height * 0.82) * ratio);
      for (const layer of layers) {
        const tile = layer.image.width;
        const tall = layer.image.height;
        const base = line - Math.round(layer.lift * ratio);
        const offset = (t * layer.speed * ratio) % tile;
        for (let x = -offset; x < element.width; x += tile) {
          const dx = Math.round(x);
          context.globalAlpha = layer.alpha;
          context.drawImage(layer.image, dx, base - tall);
          // The reflection, upside down under the shore, in slices that ripple.
          context.globalAlpha = layer.alpha * 0.32;
          for (let row = 0; row < tall; row += SLICE * ratio) {
            const y = 2 * line - (base - tall + row) - SLICE * ratio;
            if (y > element.height) continue;
            const ripple = Math.sin(row / (9 * ratio) + t * 1.6) * 2.2 * ratio;
            context.drawImage(layer.image, 0, row, tile, SLICE * ratio, dx + ripple, y, tile, SLICE * ratio);
          }
        }
      }
      context.globalAlpha = 1;
      // The water darkens away from the shore.
      const fade = context.createLinearGradient(0, line, 0, element.height);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.75, "rgba(0,0,0,1)");
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = fade;
      context.fillRect(0, line, element.width, element.height - line);
      context.globalCompositeOperation = "source-over";
      // The shoreline itself, a thin gold line.
      context.fillStyle = "rgba(231, 194, 106, 0.35)";
      context.fillRect(0, line, element.width, Math.max(1, ratio));
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    resize();
    const onResize = () => {
      resize();
      if (still) draw(0);
    };
    window.addEventListener("resize", onResize);
    if (still) draw(0);
    else frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [still, shore]);

  return <canvas ref={canvas} className="vg-skyline" aria-hidden />;
}

interface Layer {
  image: HTMLCanvasElement;
  speed: number;
  lift: number;
  alpha: number;
}

/** The reflection's slices, in CSS pixels. */
const SLICE = 3;

/** The skyline's own size: one tile, repeated side by side. */
const TILE_W = 3000;
const TILE_H = 620;
const GROUND = TILE_H - 10;

/**
 * One row: the skyline drawn as a silhouette, then sampled on a staggered grid. A dot whose
 * neighbour is outside the silhouette is on its outline and drawn brighter. `back` is the other
 * skyline, so the two rows do not repeat each other.
 */
function buildLayer(scale: number, spacing: number, ratio: number, back: boolean): { image: HTMLCanvasElement } {
  const w = Math.ceil(TILE_W * scale);
  const h = Math.ceil(TILE_H * scale);
  const shape = document.createElement("canvas");
  shape.width = w;
  shape.height = h;
  const s = shape.getContext("2d", { willReadFrequently: true })!;
  s.scale(scale, scale);
  s.fillStyle = "#fff";
  drawSkyline(s, back);
  const pixels = s.getImageData(0, 0, w, h).data;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pixels[(Math.floor(y) * w + Math.floor(x)) * 4 + 3]! > 120;

  const image = document.createElement("canvas");
  image.width = Math.ceil(w * ratio);
  image.height = Math.ceil(h * ratio);
  const d = image.getContext("2d")!;
  d.scale(ratio, ratio);
  const step = spacing;
  const half = step * 0.75;
  for (let y = step / 2; y < h; y += step) {
    // The rows stagger, as a halftone.
    const shift = (Math.round(y / step) % 2) * (step / 2);
    for (let x = shift; x < w; x += step) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - half, y) || !inside(x + half, y) || !inside(x, y - half) || !inside(x, y + half);
      // Brighter toward the top, as if lit from above; the outline brightest.
      const lit = 1 - y / h;
      d.globalAlpha = edge ? 1 : 0.42 + 0.45 * lit;
      d.fillStyle = edge ? "#FBE3A4" : "#D8AE57";
      const size = edge ? step * 0.62 : step * 0.44;
      d.beginPath();
      d.arc(x, y, size / 2, 0, Math.PI * 2);
      d.fill();
    }
  }
  return { image };
}

/** The skyline as it drifts right to left: the vakıf monuments along an Ottoman city's waterfront. */
function drawSkyline(c: CanvasRenderingContext2D, back: boolean) {
  const g = GROUND;
  c.fillRect(0, g, TILE_W, TILE_H - g);
  if (!back) {
    cypresses(c, [40, 74, 104], [170, 240, 190]);
    grandMosque(c, 470, 150, 4);
    turbe(c, 930, 110);
    cypresses(c, [1040, 1072], [220, 170]);
    bridge(c, 1120, 380);
    tower(c, 1640, 360);
    han(c, 1760, 420);
    grandMosque(c, 2470, 118, 2);
    cypresses(c, [2850, 2884, 2920], [180, 250, 200]);
  } else {
    grandMosque(c, 330, 120, 2);
    cypresses(c, [640, 676], [200, 160]);
    han(c, 720, 380);
    grandMosque(c, 1520, 160, 4);
    turbe(c, 2010, 96);
    tower(c, 2240, 320);
    grandMosque(c, 2650, 104, 2);
  }
}

/**
 * A great mosque, as the imperial ones rise: a courtyard arcade in front, the prayer hall with its
 * corner turrets and rows of windows, small domes cascading up to the half-domes, the drum with its
 * windows, the great dome with its alem, and two or four minarets with their balconies.
 */
function grandMosque(c: CanvasRenderingContext2D, cx: number, r: number, minarets: 2 | 4) {
  const g = GROUND;
  // The courtyard's arcade, low, with its little domes.
  const arcadeTop = g - r * 0.42;
  c.fillRect(cx - r * 2.7, arcadeTop, r * 5.4, r * 0.42);
  for (let x = cx - r * 2.5; x <= cx + r * 2.5; x += r * 0.31) dome(c, x, arcadeTop, r * 0.12, r * 0.11);
  // The hall.
  const hallTop = g - r * 1.05;
  c.fillRect(cx - r * 1.95, hallTop, r * 3.9, r * 0.63);
  // Corner turrets with their domes.
  for (const side of [-1, 1]) {
    const tx = cx + side * r * 1.82;
    c.fillRect(tx - r * 0.11, hallTop - r * 0.32, r * 0.22, r * 0.32);
    dome(c, tx, hallTop - r * 0.32, r * 0.11, r * 0.12);
    finial(c, tx, hallTop - r * 0.44, r * 0.1);
  }
  // Cascading domes: small ones, then the half-domes, each on its own step.
  for (const side of [-1, 1]) {
    dome(c, cx + side * r * 1.42, hallTop, r * 0.26, r * 0.24);
    finial(c, cx + side * r * 1.42, hallTop - r * 0.24, r * 0.12);
    c.fillRect(cx + side * r * 0.85 - r * 0.42, hallTop - r * 0.16, r * 0.84, r * 0.16);
    dome(c, cx + side * r * 0.85, hallTop - r * 0.16, r * 0.46, r * 0.42);
  }
  // Drum, great dome, alem.
  const drumTop = hallTop - r * 0.5;
  c.fillRect(cx - r * 0.86, drumTop, r * 1.72, r * 0.5);
  for (const side of [-1, 1]) c.fillRect(cx + side * r * 0.9 - r * 0.07, drumTop + r * 0.06, r * 0.14, r * 0.44);
  dome(c, cx, drumTop, r * 0.88, r * 0.8);
  finial(c, cx, drumTop - r * 0.8, r * 0.34);
  // Windows: a row in the drum, two rows in the hall, the arcade's arches.
  cut(c, () => {
    for (let i = -4; i <= 4; i++) arch(c, cx + i * r * 0.18, drumTop + r * 0.4, r * 0.045, r * 0.22);
    for (let i = -6; i <= 6; i++) {
      if (Math.abs(i) <= 1) continue;
      arch(c, cx + i * r * 0.27, hallTop + r * 0.3, r * 0.055, r * 0.2);
    }
    for (let x = cx - r * 2.35; x <= cx + r * 2.35; x += r * 0.31) if (Math.abs(x - cx) > r * 0.3) arch(c, x, g, r * 0.1, r * 0.3);
    arch(c, cx, g, r * 0.2, r * 0.38);
  });
  // Minarets: the inner pair tallest, with three balconies; an outer pair lower, with two.
  const height = r * 3.25;
  minaret(c, cx - r * 2.95, height, r * 0.13, 3);
  minaret(c, cx + r * 2.95, height, r * 0.13, 3);
  if (minarets === 4) {
    minaret(c, cx - r * 3.5, height * 0.82, r * 0.12, 2);
    minaret(c, cx + r * 3.5, height * 0.82, r * 0.12, 2);
  }
}

/** A dome sitting on `base`: the top of an ellipse, a touch pointed at its crown. */
function dome(c: CanvasRenderingContext2D, cx: number, base: number, rx: number, ry: number) {
  c.beginPath();
  c.moveTo(cx - rx, base);
  c.bezierCurveTo(cx - rx, base - ry * 0.62, cx - rx * 0.52, base - ry, cx, base - ry * 1.04);
  c.bezierCurveTo(cx + rx * 0.52, base - ry, cx + rx, base - ry * 0.62, cx + rx, base);
  c.closePath();
  c.fill();
}

/** An alem: a slim rod, two little bulbs and a crescent at the top. */
function finial(c: CanvasRenderingContext2D, x: number, base: number, size: number) {
  c.fillRect(x - size * 0.04, base - size, size * 0.08, size);
  for (const at of [0.3, 0.62]) {
    c.beginPath();
    c.arc(x, base - size * at, size * 0.1, 0, Math.PI * 2);
    c.fill();
  }
  const cy = base - size - size * 0.16;
  c.beginPath();
  c.arc(x, cy, size * 0.17, 0, Math.PI * 2);
  c.fill();
  cut(c, () => {
    c.beginPath();
    c.arc(x + size * 0.08, cy - size * 0.05, size * 0.14, 0, Math.PI * 2);
    c.fill();
  });
}

/** A minaret: a base, a slim shaft, `balconies` şerefe with their corbels, a pencil cap and an alem. */
function minaret(c: CanvasRenderingContext2D, x: number, height: number, width: number, balconies: 2 | 3) {
  const g = GROUND;
  const capBase = g - height * 0.8;
  c.fillRect(x - width * 0.8, g - height * 0.16, width * 1.6, height * 0.16);
  c.beginPath();
  c.moveTo(x - width * 0.8, g - height * 0.16);
  c.lineTo(x - width * 0.5, g - height * 0.2);
  c.lineTo(x + width * 0.5, g - height * 0.2);
  c.lineTo(x + width * 0.8, g - height * 0.16);
  c.fill();
  c.fillRect(x - width / 2, capBase, width, height * 0.8);
  const spots = balconies === 3 ? [0.38, 0.53, 0.68] : [0.45, 0.64];
  for (const at of spots) {
    const y = g - height * at;
    c.beginPath();
    c.moveTo(x - width / 2, y + width * 0.55);
    c.lineTo(x - width * 1.05, y);
    c.lineTo(x + width * 1.05, y);
    c.lineTo(x + width / 2, y + width * 0.55);
    c.fill();
    c.fillRect(x - width * 1.05, y - width * 0.28, width * 2.1, width * 0.28);
  }
  c.beginPath();
  c.moveTo(x - width * 0.62, capBase);
  c.lineTo(x, capBase - height * 0.2);
  c.lineTo(x + width * 0.62, capBase);
  c.closePath();
  c.fill();
  finial(c, x, capBase - height * 0.2, width * 1.3);
}

/** A türbe: an octagon, a drum, a dome and its alem, the door cut out. */
function turbe(c: CanvasRenderingContext2D, cx: number, w: number) {
  const g = GROUND;
  const top = g - w * 1.05;
  c.fillRect(cx - w / 2, top, w, w * 1.05);
  c.fillRect(cx - w * 0.58, top - w * 0.06, w * 1.16, w * 0.06);
  c.fillRect(cx - w * 0.4, top - w * 0.28, w * 0.8, w * 0.22);
  dome(c, cx, top - w * 0.28, w * 0.42, w * 0.44);
  finial(c, cx, top - w * 0.72, w * 0.3);
  cut(c, () => {
    arch(c, cx, g, w * 0.13, w * 0.46);
    for (const side of [-1, 1]) arch(c, cx + side * w * 0.3, top + w * 0.5, w * 0.06, w * 0.24);
    for (let i = -2; i <= 2; i++) arch(c, cx + i * w * 0.15, top - w * 0.08, w * 0.035, w * 0.12);
  });
}

/** A han: a long, low stone building with a row of small domes, a tall gate and a chimney here and there. */
function han(c: CanvasRenderingContext2D, x0: number, w: number) {
  const g = GROUND;
  const top = g - 120;
  c.fillRect(x0, top, w, 120);
  for (let x = x0 + 32; x < x0 + w - 20; x += 50) {
    dome(c, x, top, 21, 20);
    finial(c, x, top - 20, 12);
  }
  const gx = x0 + w / 2;
  c.fillRect(gx - 50, g - 170, 100, 170);
  c.fillRect(gx - 58, g - 178, 116, 10);
  cut(c, () => {
    arch(c, gx, g, 26, 112);
    for (let x = x0 + 36; x < x0 + w - 20; x += 50) if (Math.abs(x - gx) > 70) arch(c, x, g - 52, 7, 30);
  });
}

/** A stone bridge of five arches, the middle one the tallest, its parapet and a little kiosk on top. */
function bridge(c: CanvasRenderingContext2D, x0: number, w: number) {
  const g = GROUND;
  c.beginPath();
  c.moveTo(x0, g);
  c.lineTo(x0, g - 70);
  c.quadraticCurveTo(x0 + w / 2, g - 150, x0 + w, g - 70);
  c.lineTo(x0 + w, g);
  c.closePath();
  c.fill();
  c.fillRect(x0 + w / 2 - 24, g - 168, 48, 44);
  dome(c, x0 + w / 2, g - 168, 26, 24);
  cut(c, () => {
    const spans = [0.12, 0.3, 0.5, 0.7, 0.88];
    spans.forEach((at, i) => {
      const tall = i === 2 ? 96 : i === 1 || i === 3 ? 72 : 52;
      arch(c, x0 + w * at, g, i === 2 ? 46 : 30, tall);
    });
  });
}

/** A round stone tower: a tall shaft with windows, a gallery and a conical roof. */
function tower(c: CanvasRenderingContext2D, cx: number, height: number) {
  const g = GROUND;
  const w = 74;
  const top = g - height;
  c.fillRect(cx - w / 2, top + 60, w, height - 60);
  c.fillRect(cx - w * 0.62, top + 50, w * 1.24, 14);
  c.fillRect(cx - w * 0.44, top + 22, w * 0.88, 30);
  c.beginPath();
  c.moveTo(cx - w * 0.52, top + 24);
  c.lineTo(cx, top - 70);
  c.lineTo(cx + w * 0.52, top + 24);
  c.closePath();
  c.fill();
  finial(c, cx, top - 70, 26);
  cut(c, () => {
    for (let i = -1; i <= 1; i++) arch(c, cx + i * 20, top + 50, 6, 24);
    for (let y = top + 110; y < g - 40; y += 60) arch(c, cx, y, 7, 26);
    arch(c, cx, g, 14, 50);
  });
}

/** Cypresses: tall, narrow and pointed. */
function cypresses(c: CanvasRenderingContext2D, xs: number[], heights: number[]) {
  const g = GROUND;
  xs.forEach((x, i) => {
    const h = heights[i] ?? 180;
    c.beginPath();
    c.moveTo(x, g - h);
    c.quadraticCurveTo(x + h * 0.12, g - h * 0.5, x + h * 0.055, g);
    c.lineTo(x - h * 0.055, g);
    c.quadraticCurveTo(x - h * 0.12, g - h * 0.5, x, g - h);
    c.fill();
  });
}

/** An arched opening standing on `base`. */
function arch(c: CanvasRenderingContext2D, cx: number, base: number, halfWidth: number, height: number) {
  c.beginPath();
  c.moveTo(cx - halfWidth, base);
  c.lineTo(cx - halfWidth, base - height + halfWidth);
  c.arc(cx, base - height + halfWidth, halfWidth, Math.PI, 0);
  c.lineTo(cx + halfWidth, base);
  c.closePath();
  c.fill();
}

/** Draws `paint` as holes in what is there. */
function cut(c: CanvasRenderingContext2D, paint: () => void) {
  c.save();
  c.globalCompositeOperation = "destination-out";
  paint();
  c.restore();
}
