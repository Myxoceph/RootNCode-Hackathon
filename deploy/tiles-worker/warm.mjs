/**
 * Fills the tiles Worker's edge cache for one area (Y19), so the map draws there even
 * when OpenFreeMap is down. Run it from the network the demo uses, the day before:
 * Cloudflare caches per location, and the style follows OpenFreeMap's weekly tile set.
 *
 *   npm run map:warm                                   Bursa (the demo)
 *   npm run map:warm -- <south> <west> <north> <east>  another area, in degrees
 *
 * Fetches both styles (light, dark), their fonts and sprites, the vector tiles up to the
 * tile set's own max zoom (the map overzooms beyond) and the shaded relief up to zoom 6.
 */
const BASE = process.env.TILES_URL ?? "https://tiles.allbytech.com";
/** Every Bursa asset with coordinates, with a margin. */
const BURSA = [39.95, 28.25, 40.5, 29.85];
/** Turkish letters (ç ğ ı ö ş ü İ) sit in the first two glyph ranges. */
const GLYPH_RANGES = ["0-255", "256-511"];
const PARALLEL = 8;

const [south, west, north, east] = process.argv.length === 6 ? process.argv.slice(2).map(Number) : BURSA;

function tileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}
function tileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * 2 ** z);
}
function tilesOf(template, minZoom, maxZoom) {
  const urls = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    for (let x = tileX(west, z); x <= tileX(east, z); x++) {
      for (let y = tileY(north, z); y <= tileY(south, z); y++) urls.push(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
    }
  }
  return urls;
}

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const urls = new Set();
for (const name of ["positron", "dark"]) {
  const style = await json(`${BASE}/styles/${name}`);
  for (const source of Object.values(style.sources)) {
    const tileJson = source.url ? await json(source.url) : source;
    for (const template of tileJson.tiles ?? []) for (const url of tilesOf(template, tileJson.minzoom ?? 0, tileJson.maxzoom ?? 14)) urls.add(url);
  }
  const fonts = new Set(style.layers.flatMap((layer) => (Array.isArray(layer.layout?.["text-font"]) ? [layer.layout["text-font"].join(",")] : [])));
  for (const stack of fonts) for (const range of GLYPH_RANGES) urls.add(style.glyphs.replace("{fontstack}", encodeURIComponent(stack)).replace("{range}", range));
  for (const suffix of ["", "@2x"]) for (const ext of [".json", ".png"]) urls.add(`${style.sprite}${suffix}${ext}`);
}

const queue = [...urls];
const counts = { hit: 0, miss: 0, failed: 0 };
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const response = await fetch(url);
        await response.arrayBuffer();
        // 404: no tile there (sea, outside the data); the map draws nothing, as it would anyway.
        if (!response.ok && response.status !== 404) counts.failed++;
        else if (response.headers.get("cf-cache-status") === "HIT") counts.hit++;
        else counts.miss++;
      } catch {
        counts.failed++;
      }
    }
  }),
);

console.log(`${urls.size} files (${south}, ${west} → ${north}, ${east}): ${counts.miss} fetched into the cache, ${counts.hit} already cached, ${counts.failed} failed`);
if (counts.failed > 0) process.exitCode = 1;
