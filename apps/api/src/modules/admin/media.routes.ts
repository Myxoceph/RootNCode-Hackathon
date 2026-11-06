import {
  ADMIN_PHOTO_MAX_BYTES,
  ADMIN_PHOTO_TYPES,
  AdminPhotoUploadQuerySchema,
  AdminPhotoUploadResponseSchema,
  AssetIdSchema,
  CONTRACT_VERSION,
  type AdminPhotoUploadResponse,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { toMedia } from "../assets/assets.mapper.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import type { AdminRepository } from "./admin.repository.ts";
import type { MediaStore } from "./media-store.ts";
import { InvalidPhotoError, processPhoto } from "./photo-process.ts";

const AssetParamsSchema = z.object({ id: AssetIdSchema });
const MediaParamsSchema = z.object({ id: AssetIdSchema, key: z.string().min(1).max(120) });
const CONTENT_TYPE = { webp: "image/webp", jpg: "image/jpeg" } as const;
const bearer = [{ bearerAuth: [] }];

export interface AdminMediaRoutesOptions {
  repository: AdminRepository;
  /** For signing in the caller. */
  community: CommunityRepository;
  /** Without one (no R2 keys) uploads answer 503. */
  store: MediaStore | null;
  mediaBaseUrl: string;
}

/**
 * Photos of an asset uploaded from the panel: the request body is the image itself, as for visitor
 * photos. They are published at once, as only admins upload, and the importer leaves them alone.
 */
export const adminMediaRoutes: FastifyPluginAsync<AdminMediaRoutesOptions> = async (app, { repository, community, store, mediaBaseUrl }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  // Only in this plugin: the rest of the API keeps its 16 KB JSON body limit.
  app.addContentTypeParser([...ADMIN_PHOTO_TYPES], { parseAs: "buffer", bodyLimit: ADMIN_PHOTO_MAX_BYTES }, (_request, body, done) => done(null, body));

  app.post("/admin/assets/:id/media", {
    bodyLimit: ADMIN_PHOTO_MAX_BYTES,
    config: { rateLimit: { max: 60, timeWindow: 60 * 60 * 1000 } },
    schema: {
      tags: ["admin"],
      summary: "Esere fotoğraf yükle (yalnızca admin): gövde JPEG, PNG ya da WebP dosyanın kendisi, en çok 15 MB",
      security: bearer,
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      querystring: toOpenApiSchema(AdminPhotoUploadQuerySchema, "input"),
      response: {
        201: toOpenApiSchema(AdminPhotoUploadResponseSchema),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        413: errorSchema,
        415: errorSchema,
        429: errorSchema,
        503: errorSchema,
      },
    },
  }, async (request, reply): Promise<AdminPhotoUploadResponse> => {
    await requireUser(request, community, "admin");
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const query = parseWith(AdminPhotoUploadQuerySchema, request.query, "INVALID_QUERY");
    if (store === null) throw new HttpError(503, "MEDIA_UPLOAD_OFF", "Photo uploads are not set up on this server");
    if (!Buffer.isBuffer(request.body)) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the photo as image/jpeg, image/png or image/webp");
    if (!(await repository.assetExists(id))) throw new HttpError(404, "ASSET_NOT_FOUND", `Asset "${id}" not found`);

    let photo;
    try {
      photo = await processPhoto(request.body);
    } catch (err) {
      if (err instanceof InvalidPhotoError) throw new HttpError(400, "INVALID_IMAGE", err.message);
      throw err;
    }
    const short = photo.sha256.slice(0, 10);
    const mediaKey = `p-${short}`;
    const variants = photo.variants.map((v) => ({ ...v, key: `assets/${id}/${mediaKey}/${v.width}.${v.format}` }));
    const known = await repository.knownPhoto(photo.sha256, id);
    if (known.onAsset) throw new HttpError(409, "PHOTO_ON_ASSET", "This photo is already on this asset");
    // A photo another asset already has keeps its files: one set of variants per photo.
    if (!known.exists) {
      for (const v of variants) await store.put(v.key, v.bytes, CONTENT_TYPE[v.format]);
    }

    const largest = variants.filter((v) => v.format === "jpg").at(-1)!;
    const record = await repository.addPanelPhoto({
      assetId: id,
      mediaKey,
      photo: {
        sha256: photo.sha256,
        originalKey: largest.key,
        originalBytes: request.body.length,
        width: photo.width,
        height: photo.height,
        aspectRatio: photo.aspectRatio,
        lqip: photo.lqip,
        dominantColor: photo.dominantColor,
        credit: query.credit,
        license: query.license,
        variants: variants.map((v) => ({ key: v.key, format: v.format, width: v.width, height: v.height, bytes: v.bytes.length })),
      },
      caption: { tr: query.caption ?? query.alt, en: query.captionEn ?? query.altEn ?? null },
      alt: { tr: query.alt, en: query.altEn ?? null },
      isCover: query.isCover,
    });

    reply.code(201).header("cache-control", "no-store");
    return AdminPhotoUploadResponseSchema.parse({ version: CONTRACT_VERSION, media: toMedia(record, { lang: "tr", mediaBaseUrl, statuses: [] }) });
  });

  app.delete("/admin/assets/:id/media/:key", {
    schema: {
      tags: ["admin"],
      summary: "Panelden yüklenmiş fotoğrafı kaldır; veri setinin fotoğrafları kaldırılamaz (içe aktarma geri getirir)",
      security: bearer,
      params: toOpenApiSchema(MediaParamsSchema, "input"),
      response: { 204: { type: "null" }, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "admin");
    const { id, key } = parseWith(MediaParamsSchema, request.params, "INVALID_ID");
    const result = await repository.removePanelPhoto(id, key);
    if (result === "not_found") throw new HttpError(404, "PHOTO_NOT_FOUND", "No such photo on this asset");
    if (result === "dataset") throw new HttpError(409, "DATASET_PHOTO", "Only photos uploaded from the panel can be removed");
    // The rows are gone, so the photo is gone from the app; a file left behind costs only its bytes.
    for (const fileKey of result.fileKeys) {
      await store?.remove(fileKey).catch((err: unknown) => request.log.warn({ err, fileKey }, "Could not delete a photo's file"));
    }
    return reply.code(204).send();
  });
};
