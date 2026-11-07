import { createHash } from "node:crypto";
import {
  AppUserSchema,
  AssetIdSchema,
  AVATAR_MAX_BYTES,
  AVATAR_MIN_SIDE,
  CommunityPhotosResponseSchema,
  CONTRACT_VERSION,
  ContributionSchema,
  PHOTO_MAX_BYTES,
  PHOTO_MIN_SIDE,
  PhotoCaptionSchema,
  PHOTOS_PER_DAY,
  type AppUser,
  type CommunityPhotosResponse,
  type Contribution,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { visibleStatuses, type AssetVisibility } from "../assets/assets.repository.ts";
import { requireUser } from "./auth.ts";
import { toAppUser, toCommunityPhoto, toContribution } from "./community.mapper.ts";
import type { CommunityRepository } from "./community.repository.ts";
import { checkImage, InvalidImageError, type CheckedImage } from "./photo-image.ts";
import type { PhotoUrls } from "./photo-urls.ts";

/** Longer side above this is not a phone photo but a scan or a panorama the app cannot show well. */
const MAX_SIDE = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const AssetParamsSchema = z.object({ id: AssetIdSchema });
const UploadQuerySchema = z.object({
  caption: PhotoCaptionSchema.describe("Fotoğrafta ne görünüyor (3–200 karakter); alternatif metin olarak da kullanılır"),
});
const ListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const PhotoParamsSchema = z.object({ id: z.uuid() });
const PhotoQuerySchema = z.object({ exp: z.string().optional(), sig: z.string().optional() });

const AvatarParamsSchema = z.object({ userId: z.uuid() });

const assetNotFound = (id: string) => new HttpError(404, "ASSET_NOT_FOUND", `Asset "${id}" not found`);

export interface PhotosRoutesOptions {
  repository: CommunityRepository;
  visibility: AssetVisibility;
  urls: PhotoUrls;
}

/** The request body as a checked image without metadata, or a 400/415. */
function checkedBody(body: unknown, minSide: number): CheckedImage {
  if (!Buffer.isBuffer(body)) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the photo as image/jpeg or image/png");
  let image;
  try {
    image = checkImage(body);
  } catch (err) {
    if (err instanceof InvalidImageError) throw new HttpError(400, "INVALID_IMAGE", err.message);
    throw err;
  }
  if (Math.min(image.width, image.height) < minSide || Math.max(image.width, image.height) > MAX_SIDE) {
    throw new HttpError(400, "INVALID_IMAGE", `Sides must be between ${minSide} and ${MAX_SIDE} px`);
  }
  return image;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * Visitor photo suggestions: upload (the request body is the image itself, so no
 * multipart dependency), an asset's approved photos, and the photo files; and the
 * visitor's own profile photo, sent the same way.
 */
export const photosRoutes: FastifyPluginAsync<PhotosRoutesOptions> = async (app, { repository, visibility, urls }) => {
  const statuses = visibleStatuses(visibility);
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);

  // Only in this plugin: the rest of the API keeps its 16 KB JSON body limit.
  app.addContentTypeParser(
    ["image/jpeg", "image/png"],
    { parseAs: "buffer", bodyLimit: PHOTO_MAX_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.post("/assets/:id/photos", {
    bodyLimit: PHOTO_MAX_BYTES,
    config: { rateLimit: { max: 20, timeWindow: 60 * 60 * 1000 } },
    schema: {
      tags: ["community"],
      summary: "Esere fotoğraf öner: gövde JPEG ya da PNG dosyanın kendisi, en çok 5 MB; moderatör onayından sonra görünür",
      security: [{ bearerAuth: [] }],
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      querystring: toOpenApiSchema(UploadQuerySchema, "input"),
      response: {
        201: toOpenApiSchema(ContributionSchema),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        413: errorSchema,
        415: errorSchema,
        429: errorSchema,
      },
    },
  }, async (request, reply): Promise<Contribution> => {
    const user = await requireUser(request, repository);
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const { caption } = parseWith(UploadQuerySchema, request.query, "INVALID_QUERY");
    const image = checkedBody(request.body, PHOTO_MIN_SIDE);

    if ((await repository.findVisibleAsset(id, statuses)) === null) throw assetNotFound(id);
    if ((await repository.countPhotosSince(user.id, new Date(Date.now() - DAY_MS))) >= PHOTOS_PER_DAY) {
      throw new HttpError(429, "PHOTO_LIMIT", `At most ${PHOTOS_PER_DAY} photos per day`);
    }
    const contribution = await repository.createPhotoContribution({
      assetId: id,
      userId: user.id,
      caption,
      photo: {
        contentType: image.type,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
        sha256: sha256(image.bytes),
      },
    });

    reply.code(201).header("cache-control", "no-store");
    return ContributionSchema.parse(toContribution(contribution, urls));
  });

  app.get("/assets/:id/photos", {
    schema: {
      tags: ["community"],
      summary: "Eserin onaylanmış ziyaretçi fotoğrafları (yeniden eskiye)",
      params: toOpenApiSchema(AssetParamsSchema, "input"),
      querystring: toOpenApiSchema(ListQuerySchema, "input"),
      response: { 200: toOpenApiSchema(CommunityPhotosResponseSchema), 400: errorSchema, 404: errorSchema },
    },
  }, async (request, reply): Promise<CommunityPhotosResponse> => {
    const { id } = parseWith(AssetParamsSchema, request.params, "INVALID_ID");
    const { limit } = parseWith(ListQuerySchema, request.query, "INVALID_QUERY");
    if ((await repository.findVisibleAsset(id, statuses)) === null) throw assetNotFound(id);
    const { items, total } = await repository.findApprovedPhotos(id, limit);

    // Short caching: a newly approved photo shows up within a minute.
    reply.header("cache-control", "public, max-age=60");
    return CommunityPhotosResponseSchema.parse({
      version: CONTRACT_VERSION,
      assetId: id,
      items: items.map((item) => toCommunityPhoto(item, urls)),
      total,
    });
  });

  app.get("/photos/:id", {
    schema: {
      tags: ["community"],
      summary: "Ziyaretçi fotoğrafının dosyası; onaylanmamışsa yalnızca imzalı adresle",
      params: toOpenApiSchema(PhotoParamsSchema, "input"),
      querystring: toOpenApiSchema(PhotoQuerySchema, "input"),
    },
  }, async (request, reply) => {
    const { id } = parseWith(PhotoParamsSchema, request.params, "INVALID_ID");
    const { exp, sig } = parseWith(PhotoQuerySchema, request.query, "INVALID_QUERY");
    const file = await repository.findPhotoFile(id, statuses);
    const signed = urls.verify(id, exp, sig);
    // Unknown and not-yet-public photos answer alike, so ids cannot be probed.
    if (file === null || (!file.public && !signed)) throw new HttpError(404, "PHOTO_NOT_FOUND", "Photo not found");

    reply.header("content-type", file.contentType);
    reply.header("cache-control", file.public && !signed ? "public, max-age=86400" : "private, max-age=3600");
    return reply.send(Buffer.from(file.bytes));
  });

  app.put("/me/avatar", {
    bodyLimit: AVATAR_MAX_BYTES,
    config: { rateLimit: { max: 30, timeWindow: 60 * 60 * 1000 } },
    schema: {
      tags: ["community"],
      summary: "Profil fotoğrafını koy ya da değiştir: gövde JPEG ya da PNG dosyanın kendisi, en çok 2 MB; yalnızca sahibine görünür",
      security: [{ bearerAuth: [] }],
      response: { 200: toOpenApiSchema(AppUserSchema), 400: errorSchema, 401: errorSchema, 403: errorSchema, 413: errorSchema, 415: errorSchema, 429: errorSchema },
    },
  }, async (request, reply): Promise<AppUser> => {
    const user = await requireUser(request, repository);
    const image = checkedBody(request.body, AVATAR_MIN_SIDE);
    const saved = await repository.saveAvatar(user.id, {
      contentType: image.type,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      sha256: sha256(image.bytes),
    });
    reply.header("cache-control", "no-store");
    return AppUserSchema.parse(toAppUser(saved, urls));
  });

  app.delete("/me/avatar", {
    schema: {
      tags: ["community"],
      summary: "Profil fotoğrafını kaldır",
      security: [{ bearerAuth: [] }],
      response: { 200: toOpenApiSchema(AppUserSchema), 401: errorSchema, 403: errorSchema },
    },
  }, async (request, reply): Promise<AppUser> => {
    const user = await requireUser(request, repository);
    reply.header("cache-control", "no-store");
    return AppUserSchema.parse(toAppUser(await repository.deleteAvatar(user.id), urls));
  });

  app.get("/avatars/:userId", {
    schema: {
      tags: ["community"],
      summary: "Profil fotoğrafının dosyası; yalnızca /me'nin verdiği imzalı adresle",
      params: toOpenApiSchema(AvatarParamsSchema, "input"),
      querystring: toOpenApiSchema(PhotoQuerySchema.extend({ v: z.string().optional() }), "input"),
    },
  }, async (request, reply) => {
    const { userId } = parseWith(AvatarParamsSchema, request.params, "INVALID_ID");
    const { exp, sig } = parseWith(PhotoQuerySchema, request.query, "INVALID_QUERY");
    // Checked before the database: an unsigned request learns nothing, not even whether the user exists.
    const file = urls.verifyAvatar(userId, exp, sig) ? await repository.findAvatar(userId) : null;
    if (file === null) throw new HttpError(404, "AVATAR_NOT_FOUND", "Profile photo not found");

    reply.header("content-type", file.contentType);
    reply.header("cache-control", "private, max-age=3600");
    return reply.send(Buffer.from(file.bytes));
  });
};
