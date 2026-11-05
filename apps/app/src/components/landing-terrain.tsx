import { useEffect, useRef } from "react";

import turkeyProvinces from "@/map/turkey-provinces.json";

/**
 * The home page's ground: Turkey as a field of dots laid out in perspective, the south coast near,
 * the Black Sea far off, and rolling slowly like a landscape. The land is gold, its provinces'
 * borders brighter, the provinces with assets (Bursa, Konya, Hatay, as the map outlines them) the
 * brightest; the seas around are faint dots. Under "Hareketi azalt" it stands still.
 *
 * A canvas, web only; decorative.
 */
export function LandingTerrain({ still }: { still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const dots = buildDots();
    let frame = 0;
    let last = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = element.clientWidth;
      height = element.clientHeight;
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const t = time / 1000;
      // The floor: the south coast at the bottom edge, the Black Sea toward the horizon, the country wider than the screen.
      // A tall (phone) screen raises the floor into the room under the hero.
      const tall = height > width * 1.2;
      const horizon = height * (tall ? 0.33 : 0.5);
      const reach = height * (tall ? 0.55 : 0.5);
      const lift = height * 0.18;
      const unit = Math.max(1, Math.min(width, 1800) / 1100);
      let style = "";
      for (const dot of dots) {
        const depth = 1 + (dot.lat - NEAR_LAT) * DEPTH_PER_DEGREE;
        if (depth < 0.7) continue;
        const wave =
          Math.sin(dot.lon * 0.9 + t * 0.55) * 0.45 +
          Math.sin(dot.lat * 1.7 - t * 0.38) * 0.3 +
          Math.sin((dot.lon + dot.lat) * 0.55 + t * 0.22) * 0.5;
        const x = width / 2 + (Math.max(width, 700) * LON_SCALE * (dot.lon - CENTER_LON)) / depth;
        const y = horizon + reach / depth - (lift * (0.1 + 0.07 * wave)) / depth;
        if (x < -4 || x > width + 4 || y < 0 || y > height + 4) continue;
        const near = Math.min(1, 1 / depth);
        const size = dot.size * unit * (0.5 + near * 0.85);
        // Far dots fade into the dark; the crests of the waves catch a little more light.
        const alpha = Math.min(1, dot.alpha * (0.25 + near * 1.1) * (0.85 + 0.25 * wave));
        if (style !== dot.color) {
          style = dot.color;
          context.fillStyle = style;
        }
        context.globalAlpha = alpha;
        context.fillRect(x - size / 2, y - size / 2, size, size);
      }
      context.globalAlpha = 1;
    };

    const loop = (time: number) => {
      // About thirty frames a second is enough for a slow swell.
      if (time - last > 32) {
        last = time;
        draw(time);
      }
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
  }, [still]);

  return <canvas ref={canvas} className="vg-terrain" aria-hidden />;
}

/** Turkey's span, and how the floor is laid out: a degree of latitude this much deeper. */
const SOUTH = 33;
const NEAR_LAT = 37;
const CENTER_LON = 35.4;
const LON_SCALE = 0.155;
const DEPTH_PER_DEGREE = 0.38;
/** The provinces the map outlines in gold for their assets. */
const LIT_PLATES = new Set([16, 42, 31]);

interface Dot {
  lon: number;
  lat: number;
  size: number;
  alpha: number;
  color: string;
}

type Ring = number[][];
interface Province {
  plate: number;
  polygons: Ring[][];
  box: [number, number, number, number];
}

/** The dots, sorted far to near so the near ones are drawn over, and grouped by colour within a row. */
function buildDots(): Dot[] {
  const provinces = readProvinces();
  const dots: Dot[] = [];
  const LAND = "#DDB55C";
  const BORDER = "#F3D488";
  const LIT = "#FFE2A1";
  const SEA = "#5B6E92";

  // Land and sea on one grid; the sea thinner, out to the edges of the view.
  const step = 0.065;
  for (let lat = SOUTH; lat <= 44.6; lat += step) {
    for (let lon = 14; lon <= 57; lon += step) {
      const province = provinceAt(provinces, lon, lat);
      if (province) {
        const lit = LIT_PLATES.has(province.plate);
        dots.push({ lon, lat, size: lit ? 2.2 : 1.7, alpha: lit ? 0.75 : 0.42, color: lit ? LIT : LAND });
      } else if (Math.round(lon / step) % 4 === 0 && Math.round(lat / step) % 4 === 0) {
        dots.push({ lon, lat, size: 1.5, alpha: 0.38, color: SEA });
      }
    }
  }
  // The borders, traced dot by dot, as the map draws them.
  for (const province of provinces) {
    const lit = LIT_PLATES.has(province.plate);
    for (const polygon of province.polygons) {
      const ring = polygon[0]!;
      for (let i = 1; i < ring.length; i++) {
        const [x0, y0] = ring[i - 1] as [number, number];
        const [x1, y1] = ring[i] as [number, number];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.045));
        for (let s = 0; s < steps; s++) {
          const f = s / steps;
          dots.push({ lon: x0 + (x1 - x0) * f, lat: y0 + (y1 - y0) * f, size: lit ? 2.6 : 1.9, alpha: lit ? 1 : 0.7, color: lit ? LIT : BORDER });
        }
      }
    }
  }
  return dots.sort((a, b) => b.lat - a.lat || (a.color < b.color ? -1 : 1));
}

function readProvinces(): Province[] {
  const collection = turkeyProvinces as unknown as {
    features: { properties: { plate: number }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown } }[];
  };
  return collection.features.map((feature) => {
    const polygons = (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Ring[][];
    let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const polygon of polygons) {
      for (const [x, y] of polygon[0]! as [number, number][]) box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
    }
    return { plate: feature.properties.plate, polygons, box };
  });
}

function provinceAt(provinces: Province[], lon: number, lat: number): Province | null {
  for (const province of provinces) {
    const [minX, minY, maxX, maxY] = province.box;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (province.polygons.some((polygon) => inside(polygon[0]!, lon, lat))) return province;
  }
  return null;
}

/** Ray casting: whether the point is inside the ring. */
function inside(ring: Ring, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
