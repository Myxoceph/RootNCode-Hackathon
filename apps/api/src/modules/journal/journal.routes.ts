import {
  CONTRACT_VERSION,
  JOURNAL_PHOTO_MAX_BYTES,
  JOURNAL_PHOTO_MIN_SIDE,
  JOURNAL_PHOTO_TYPES,
  JOURNAL_PHOTOS_KEPT,
  JOURNAL_PHOTOS_PER_DAY,
  JOURNAL_PHOTOS_PER_ENTRY,
  JournalEntrySchema,
  JournalIdSchema,
  JournalLayoutSchema,
  JournalPageQuerySchema,
  JournalPageResponseSchema,
  JournalPhotoSchema,
  JournalPhotoUploadQuerySchema,
  JournalWriteRequestSchema,
  type JournalEntry,
  type JournalPageResponse,
  type JournalPhoto,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { InvalidPhotoError, processPhoto, type PhotoProfile } from "../admin/photo-process.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import type { PhotoUrls } from "../community/photo-urls.ts";
import type { JournalCursor, JournalEntryRecord, JournalPhotoRecord, JournalRepository } from "./journal.repository.ts";

/** Two sizes in one format at a lower effort: a page's picture, and the one shown when it is opened. */
const JOURNAL_PROFILE: PhotoProfile = {
  widths: [640, 1600],
  formats: ["webp"],
  webpEffort: 4,
  minSide: JOURNAL_PHOTO_MIN_SIDE,
  maxPixels: 50_000_000,
};
const DAY_MS = 24 * 60 * 60 * 1000;
/** A page's text and its drawing at their largest; the API's 16 KB limit stays for every other request. */
const WRITE_BODY_LIMIT = 96 * 1024;
const bearer = [{ bearerAuth: [] }];

const IdParamsSchema = z.object({ id: JournalIdSchema });
const FileParamsSchema = z.object({ id: JournalIdSchema, size: z.enum(["thumb", "full"]) });
const FileQuerySchema = z.object({ exp: z.string().optional(), sig: z.string().optional() });

const entryNotFound = () => new HttpError(404, "JOURNAL_ENTRY_NOT_FOUND", "Journal entry not found");

function readCursor(value: string | undefined): JournalCursor | null {
  if (value === undefined) return null;
  const [at, id] = value.split("_");
  const createdAt = new Date(Number(at));
  if (!id || !JournalIdSchema.safeParse(id).success || Number.isNaN(createdAt.getTime())) {
    throw new HttpError(400, "INVALID_QUERY", "Unknown cursor");
  }
  return { createdAt, id };
}

/**
 * Profil · Anı Defteri (`/me/journal`): text and photos only their owner ever sees. Every route but
 * the photo files needs the owner's token and looks only among the owner's rows; a file needs the
 * signed path the owner's own list gave, as image tags cannot send a token. Unlike an asset's photos
 * these stay off the public bucket and its CDN (ADR 0004); a page is still light, as the list holds
 * no files and a page's picture is the small size.
 */
export const journalRoutes: FastifyPluginAsync<{ repository: JournalRepository; community: CommunityRepository; urls: PhotoUrls }> = async (app, { repository, community, urls }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };

  const toPhoto = (photo: JournalPhotoRecord): JournalPhoto => ({
    id: photo.id,
    width: photo.width,
    height: photo.height,
    lqip: photo.lqip,
    dominantColor: photo.dominant_color,
    thumbUrl: urls.journalPath(photo.id, "thumb"),
    fullUrl: urls.journalPath(photo.id, "full"),
  });
  const toEntry = (entry: JournalEntryRecord): JournalEntry => ({
    id: entry.id,
    text: entry.text,
    photos: entry.photos.map(toPhoto),
    // One saved under an older contract falls back to the usual layout rather than failing the list.
    layout: JournalLayoutSchema.safeParse(entry.layout).data ?? null,
    createdAt: entry.created_at.toISOString(),
    updatedAt: entry.updated_at.toISOString(),
  });

  // Only in this plugin: the rest of the API keeps its 16 KB JSON body limit.
  app.addContentTypeParser([...JOURNAL_PHOTO_TYPES], { parseAs: "buffer", bodyLimit: JOURNAL_PHOTO_MAX_BYTES }, (_request, body, done) => done(null, body));

  app.get("/me/journal", {
    schema: {
      tags: ["journal"],
      summary: "Anı defterimin bir sayfası (yeniden eskiye); dosyalar değil, imzalı adresleri döner",
      security: bearer,
      querystring: toOpenApiSchema(JournalPageQuerySchema, "input"),
      response: { 200: toOpenApiSchema(JournalPageResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply): Promise<JournalPageResponse> => {
    const user = await requireUser(request, community);
    const { limit, cursor } = parseWith(JournalPageQuerySchema, request.query, "INVALID_QUERY");
    const { items, total } = await repository.list(user.id, limit, readCursor(cursor));
    const last = items.at(-1);
    reply.header("cache-control", "no-store");
    return JournalPageResponseSchema.parse({
      version: CONTRACT_VERSION,
      items: items.map(toEntry),
      total,
      nextCursor: items.length === limit && last ? `${last.created_at.getTime()}_${last.id}` : null,
    });
  });

  app.post("/me/journal", {
    bodyLimit: WRITE_BODY_LIMIT,
    config: { rateLimit: { max: 120, timeWindow: 60 * 60 * 1000 } },
    schema: {
      tags: ["journal"],
      summary: "Anı defterine yeni sayfa ekle; fotoğraflar ardından tek tek gönderilir",
      security: bearer,
      body: toOpenApiSchema(JournalWriteRequestSchema, "input"),
      response: { 201: toOpenApiSchema(JournalEntrySchema), 400: errorSchema, ...denied, 429: errorSchema },
    },
  }, async (request, reply): Promise<JournalEntry> => {
    const user = await requireUser(request, community);
    const { text, layout } = parseWith(JournalWriteRequestSchema, request.body, "INVALID_BODY");
    reply.code(201).header("cache-control", "no-store");
    return toEntry(await repository.create(user.id, text || null, layout ?? null));
  });

  app.patch("/me/journal/:id", {
    bodyLimit: WRITE_BODY_LIMIT,
    schema: {
      tags: ["journal"],
      summary: "Anı defterindeki sayfanın yazısını ve yerleşimini değiştir",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      body: toOpenApiSchema(JournalWriteRequestSchema, "input"),
      response: { 200: toOpenApiSchema(JournalEntrySchema), 400: errorSchema, ...denied, 404: errorSchema },
    },
  }, async (request, reply): Promise<JournalEntry> => {
    const user = await requireUser(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const { text, layout } = parseWith(JournalWriteRequestSchema, request.body, "INVALID_BODY");
    const entry = await repository.update(user.id, id, text || null, layout);
    if (entry === null) throw entryNotFound();
    reply.header("cache-control", "no-store");
    return toEntry(entry);
  });

  app.delete("/me/journal/:id", {
    schema: {
      tags: ["journal"],
      summary: "Anı defterindeki sayfayı fotoğraflarıyla birlikte sil",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 204: { type: "null" }, 400: errorSchema, ...denied, 404: errorSchema },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    if (!(await repository.remove(user.id, id))) throw entryNotFound();
    return reply.code(204).send();
  });

  app.post("/me/journal/:id/photos", {
    bodyLimit: JOURNAL_PHOTO_MAX_BYTES,
    config: { rateLimit: { max: 60, timeWindow: 60 * 60 * 1000 } },
    schema: {
      tags: ["journal"],
      summary: "Sayfaya fotoğraf ekle: gövde JPEG, PNG ya da WebP dosyanın kendisi, en çok 10 MB; küçük boyutları sunucu üretir",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      querystring: toOpenApiSchema(JournalPhotoUploadQuerySchema, "input"),
      response: { 201: toOpenApiSchema(JournalPhotoSchema), 400: errorSchema, ...denied, 404: errorSchema, 409: errorSchema, 413: errorSchema, 415: errorSchema, 429: errorSchema },
    },
  }, async (request, reply): Promise<JournalPhoto> => {
    const user = await requireUser(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const { id: photoId } = parseWith(JournalPhotoUploadQuerySchema, request.query, "INVALID_QUERY");
    if (!Buffer.isBuffer(request.body)) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the photo as image/jpeg, image/png or image/webp");

    // Every limit before the photo is processed: that is the costly part.
    const inEntry = await repository.countEntryPhotos(user.id, id);
    if (inEntry === null) throw entryNotFound();
    if (photoId !== undefined) {
      const known = await repository.findPhotoOwner(photoId);
      // The answer to an earlier try may have been lost on the way: sending it again changes nothing.
      if (known?.user_id === user.id && known.entry_id === id) {
        reply.code(201).header("cache-control", "no-store");
        return toPhoto(known);
      }
      if (known) throw new HttpError(409, "JOURNAL_PHOTO_ID_TAKEN", "This photo id is in use");
    }
    if (inEntry >= JOURNAL_PHOTOS_PER_ENTRY) throw new HttpError(409, "JOURNAL_ENTRY_FULL", `At most ${JOURNAL_PHOTOS_PER_ENTRY} photos per entry`);
    if ((await repository.countPhotos(user.id)) >= JOURNAL_PHOTOS_KEPT) throw new HttpError(409, "JOURNAL_FULL", `At most ${JOURNAL_PHOTOS_KEPT} photos in a journal`);
    if ((await repository.countPhotos(user.id, new Date(Date.now() - DAY_MS))) >= JOURNAL_PHOTOS_PER_DAY) {
      throw new HttpError(429, "JOURNAL_PHOTO_LIMIT", `At most ${JOURNAL_PHOTOS_PER_DAY} photos per day`);
    }

    let processed;
    try {
      processed = await processPhoto(request.body, JOURNAL_PROFILE);
    } catch (err) {
      if (err instanceof InvalidPhotoError) throw new HttpError(400, "INVALID_IMAGE", err.message);
      throw err;
    }
    const photo = await repository.addPhoto(user.id, id, {
      ...(photoId === undefined ? {} : { id: photoId }),
      width: processed.width,
      height: processed.height,
      lqip: processed.lqip,
      dominantColor: processed.dominantColor,
      contentType: "image/webp",
      thumb: processed.variants.at(0)!.bytes,
      full: processed.variants.at(-1)!.bytes,
    });
    reply.code(201).header("cache-control", "no-store");
    return toPhoto(photo);
  });

  app.delete("/me/journal/photos/:id", {
    schema: {
      tags: ["journal"],
      summary: "Anı defterindeki fotoğrafı sil",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 204: { type: "null" }, 400: errorSchema, ...denied, 404: errorSchema },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, community);
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    if (!(await repository.removePhoto(user.id, id))) throw new HttpError(404, "JOURNAL_PHOTO_NOT_FOUND", "Journal photo not found");
    return reply.code(204).send();
  });

  app.get("/journal-photos/:id/:size", {
    // A page of photos must not use up the whole app's allowance of requests.
    config: { rateLimit: { max: 600, timeWindow: 60 * 1000 } },
    schema: {
      tags: ["journal"],
      summary: "Anı defteri fotoğrafının dosyası; yalnızca sahibinin listesinin verdiği imzalı adresle",
      params: toOpenApiSchema(FileParamsSchema, "input"),
      querystring: toOpenApiSchema(FileQuerySchema, "input"),
    },
  }, async (request, reply) => {
    const { id, size } = parseWith(FileParamsSchema, request.params, "INVALID_ID");
    const { exp, sig } = parseWith(FileQuerySchema, request.query, "INVALID_QUERY");
    // Checked before the database: an unsigned request learns nothing, not even whether the photo exists.
    const file = urls.verifyJournal(id, exp, sig) ? await repository.findPhotoFile(id, size) : null;
    if (file === null) throw new HttpError(404, "JOURNAL_PHOTO_NOT_FOUND", "Journal photo not found");
    reply.header("content-type", file.contentType);
    // `private`: for the owner's own device; nothing in between may keep it.
    reply.header("cache-control", "private, max-age=86400");
    return reply.send(Buffer.from(file.bytes));
  });
};
