import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { HttpError } from "../../lib/http-error.ts";
import { isSafeMediaKey } from "../admin/media-store.ts";

export interface LocalMediaRoutesOptions {
  /** The local media store's folder (createLocalMediaStore). */
  dir: string;
  /** Where a key not on this machine is read from: the shared media host (read only). */
  fallbackBaseUrl: string;
}

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mind": "application/octet-stream",
  ".json": "application/json",
};

/**
 * `GET /local-media/*`: Veri Döngüsü's development only (INTAKE_LOCAL_ONLY), with MEDIA_BASE_URL set
 * to this route. Serves what the local store wrote; a key it does not have (the dataset's photos
 * already on the media host) answers a redirect there, so the app shows both. Reads may go out;
 * writes never do.
 */
export const localMediaRoutes: FastifyPluginAsync<LocalMediaRoutesOptions> = async (app, { dir, fallbackBaseUrl }) => {
  const fallback = fallbackBaseUrl.replace(/\/+$/, "");

  app.get("/local-media/*", { config: { rateLimit: false }, schema: { hide: true } }, async (request, reply) => {
    const key = (request.params as { "*": string })["*"];
    if (!isSafeMediaKey(key)) throw new HttpError(400, "INVALID_KEY", "Not a media key");
    const path = join(dir, key);
    const found = await stat(path).catch(() => null);
    if (!found?.isFile()) return reply.redirect(`${fallback}/${key}`, 302);
    reply.header("Cache-Control", "no-cache");
    reply.header("Access-Control-Allow-Origin", "*");
    reply.type(TYPES[extname(key).toLowerCase()] ?? "application/octet-stream");
    return reply.send(createReadStream(path));
  });
};
