/**
 * Serves the map's base layer (OpenFreeMap) under our own domain (Y19).
 *
 * The map loads a style, a TileJSON, vector tiles, fonts and sprites from
 * tiles.openfreemap.org. This Worker forwards those requests and caches the
 * answers at the edge, so a map that was opened (or warmed with
 * `npm run map:warm`) keeps drawing when OpenFreeMap is slow, down or blocked.
 * The style and the TileJSON name their URLs; they are rewritten to this host.
 */

const ORIGIN = "https://tiles.openfreemap.org";
/** Tiles and sprites sit under versioned paths: a URL never changes content. */
const LONG_SECONDS = 60 * 60 * 24 * 30;
/** Fonts do not (`/fonts/<stack>/<range>.pbf`), though they rarely change. */
const FONT_SECONDS = 60 * 60 * 24 * 7;
/** The style and the TileJSON point at the latest weekly tile set. */
const JSON_SECONDS = 60 * 60 * 24;
/** Only what a style needs; anything else is not forwarded. */
const ALLOWED = /^\/(styles\/[\w-]+|planet|planet\/.+|natural_earth\/.+|fonts\/.+|sprites\/.+)$/;

export default {
  /**
   * @param {Request} request
   * @param {unknown} env
   * @param {{ waitUntil: (promise: Promise<unknown>) => void }} ctx
   */
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    if (url.pathname === "/") return new Response("Vagabonds map tiles", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (!ALLOWED.test(url.pathname)) return new Response("Not found", { status: 404 });

    const json = url.pathname.startsWith("/styles/") || url.pathname === "/planet";
    return json ? serveJson(url, ctx) : serveFile(url, request.method);
  },
};

/** Tiles, fonts, sprites: cached as they are. */
async function serveFile(url, method) {
  const font = url.pathname.startsWith("/fonts/");
  const seconds = font ? FONT_SECONDS : LONG_SECONDS;
  let upstream;
  try {
    upstream = await fetch(`${ORIGIN}${url.pathname}`, {
      method,
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": seconds, 404: 60, "500-599": 0 } },
    });
  } catch {
    // Not cached and OpenFreeMap unreachable; say so, with CORS, so the map logs the real cause.
    return new Response("Map tiles unavailable", { status: 502, headers: corsHeaders(new Headers()) });
  }
  const headers = corsHeaders(upstream.headers);
  if (upstream.ok) headers.set("Cache-Control", `public, max-age=${seconds}${font ? "" : ", immutable"}`);
  return new Response(upstream.body, { status: upstream.status, headers });
}

/**
 * The style and the TileJSON, with OpenFreeMap's URLs pointing here. The last good copy is
 * kept for a month: if OpenFreeMap fails, the map still finds its (cached) tiles.
 */
async function serveJson(url, ctx) {
  const cache = caches.default;
  const lastGood = new Request(`${url.origin}/last-good${url.pathname}`);

  let body = null;
  try {
    const upstream = await fetch(`${ORIGIN}${url.pathname}`, {
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": JSON_SECONDS, "400-599": 0 } },
    });
    if (upstream.ok) {
      body = (await upstream.text()).replaceAll(ORIGIN, url.origin);
      const copy = new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${LONG_SECONDS}` } });
      ctx.waitUntil(cache.put(lastGood, copy));
    }
  } catch {
    // OpenFreeMap unreachable; fall back to the last good copy below.
  }
  if (body === null) {
    const stale = await cache.match(lastGood);
    if (!stale) return new Response("Map style unavailable", { status: 502, headers: corsHeaders(new Headers()) });
    body = await stale.text();
  }

  const headers = corsHeaders(new Headers({ "Content-Type": "application/json" }));
  headers.set("Cache-Control", `public, max-age=${60 * 60}`);
  return new Response(body, { headers });
}

function corsHeaders(from) {
  const headers = new Headers(from);
  headers.set("Access-Control-Allow-Origin", "*");
  return headers;
}
