/**
 * Serves the media bucket under our own domain (Y14).
 *
 * The bucket lives in another Cloudflare account, and R2 binds a custom domain
 * only within its own account; this Worker forwards each request to the bucket's
 * public URL instead. Turkish operators block `r2.dev` for their users, but the
 * Worker reaches it from inside Cloudflare. Responses are cached at the edge, so
 * each image is fetched from the bucket once per location.
 */

/** Image variants are content-addressed (`m02-e06842fd8d/1280.webp`): a key never changes content. */
const CACHE_SECONDS = 60 * 60 * 24 * 30;

export default {
  /**
   * @param {Request} request
   * @param {{ ORIGIN: string }} env
   */
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const { pathname } = new URL(request.url);
    if (pathname === "/") return new Response("Vagabonds media", { headers: { "Content-Type": "text/plain; charset=utf-8" } });

    const upstream = await fetch(`${env.ORIGIN}${pathname}`, {
      method: request.method,
      cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": CACHE_SECONDS, 404: 60, "500-599": 0 } },
    });

    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    if (upstream.ok) headers.set("Cache-Control", `public, max-age=${CACHE_SECONDS}, immutable`);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
