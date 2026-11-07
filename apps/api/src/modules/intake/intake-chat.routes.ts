import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  CONTRACT_VERSION,
  INTAKE_CHAT_MAX_FILES,
  INTAKE_CHAT_MAX_MESSAGES,
  INTAKE_UPLOAD_MAX_BYTES,
  INTAKE_UPLOAD_TYPES,
  IntakeChatCreateRequestSchema,
  IntakeChatInputSchema,
  IntakeChatMessageRequestSchema,
  IntakeJobResponseSchema,
  IntakeUploadQuerySchema,
  IntakeUploadResponseSchema,
  IntakeUploadSchema,
  type IntakeChatFile,
  type IntakeChatInput,
  type IntakeUpload,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import type { MediaStore } from "../admin/media-store.ts";
import { InvalidPhotoError, processPhoto } from "../admin/photo-process.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import { toIntakeDraft, toIntakeJob, type IntakeRepository } from "./intake.repository.ts";

export interface IntakeChatRoutesOptions {
  repository: IntakeRepository;
  community: CommunityRepository;
  /** Where the processed photos go (the local store with INTAKE_LOCAL_ONLY); without one, uploads answer 503. */
  store: MediaStore | null;
  /** The repo's root, and the intake folder under it (data/build/cache/intake). */
  root: string;
  dir: string;
}

const IdParamsSchema = z.object({ id: z.uuid() });
const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const CONTENT_TYPE = { webp: "image/webp", jpg: "image/jpeg" } as const;

/** A chat's title in lists: its first line, as the admin wrote it. */
export function chatTitle(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (!line) return "Fotoğraflar";
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

/**
 * Sohbetten Kabul (docs/plans/yigit-veri-dongusu.md §1.3): an admin tells about one new asset in a
 * chat; the worker (data/pipeline) turns it into a draft in the review queue. The API only keeps and
 * serves the messages: no model is called here.
 *
 * Photos go first, one per request, as the panel's other uploads do (no multipart): each is kept as
 * sent (with its EXIF: the worker reads where it was taken) and processed into the media store. A
 * message then names its uploads, so the worker never sees half a message.
 */
export const intakeChatRoutes: FastifyPluginAsync<IntakeChatRoutesOptions> = async (app, { repository, community, store, root, dir }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };
  const bearer = [{ bearerAuth: [] }];
  const uploadsDir = resolve(root, dir, "uploads");

  app.addContentTypeParser([...INTAKE_UPLOAD_TYPES], { parseAs: "buffer", bodyLimit: INTAKE_UPLOAD_MAX_BYTES }, (_request, body, done) => done(null, body));

  app.post("/admin/intake/uploads", {
    bodyLimit: INTAKE_UPLOAD_MAX_BYTES,
    // Before the body is read, as for PDFs.
    onRequest: async (request) => {
      await requireUser(request, community, "moderator");
    },
    schema: {
      tags: ["moderation"],
      summary: "Sohbetten Kabul: bir mesajın fotoğrafını yükle (gövde fotoğrafın kendisi); mesaj onu kimliğiyle anar",
      security: bearer,
      querystring: toOpenApiSchema(IntakeUploadQuerySchema, "input"),
      response: { 201: toOpenApiSchema(IntakeUploadResponseSchema), 400: errorSchema, 413: errorSchema, 415: errorSchema, 503: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "moderator");
    const query = parseWith(IntakeUploadQuerySchema, request.query, "INVALID_QUERY");
    if (store === null) throw new HttpError(503, "MEDIA_UPLOAD_OFF", "Photo uploads are not set up on this server");
    const mime = (request.headers["content-type"] ?? "").split(";")[0]!.trim();
    if (!Buffer.isBuffer(request.body) || !EXTENSION[mime]) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", `Send the photo as ${INTAKE_UPLOAD_TYPES.join(", ")}`);

    let photo;
    try {
      photo = await processPhoto(request.body);
    } catch (error) {
      if (error instanceof InvalidPhotoError) throw new HttpError(400, "INVALID_IMAGE", error.message);
      throw error;
    }
    const id = randomUUID();
    for (const v of photo.variants) await store.put(`intake/${id}/${v.width}.${v.format}`, v.bytes, CONTENT_TYPE[v.format]);
    const shown = photo.variants.find((v) => v.format === "jpg" && v.width === 1280) ?? photo.variants.filter((v) => v.format === "jpg").at(-1)!;
    const upload: IntakeUpload = {
      id,
      name: query.name ?? `foto.${EXTENSION[mime]}`,
      mime,
      key: `intake/${id}/${shown.width}.jpg`,
      width: photo.width,
      height: photo.height,
    };
    // The original as sent, beside what the message will need of it.
    const folder = join(uploadsDir, id);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, `original.${EXTENSION[mime]}`), request.body);
    await writeFile(join(folder, "upload.json"), JSON.stringify(upload));
    reply.code(201);
    return IntakeUploadResponseSchema.parse({ version: CONTRACT_VERSION, upload });
  });

  /**
   * A message's uploads as the chat's files, at the paths they will have under the job
   * (`<dir>/<job>/files/<n>.<ext>`). Nothing is moved yet: an upload that is unknown or already sent
   * is a 400, and a message the database turns down leaves its uploads to be sent again.
   */
  async function readUploads(jobId: string, uploadIds: string[], message: number, first: number) {
    const taken: Array<{ file: IntakeChatFile; from: string; folder: string }> = [];
    for (const [i, uploadId] of uploadIds.entries()) {
      const folder = join(uploadsDir, uploadId);
      const meta = await readFile(join(folder, "upload.json"), "utf8").catch(() => null);
      let upload: IntakeUpload | null = null;
      try {
        upload = meta === null ? null : IntakeUploadSchema.parse(JSON.parse(meta));
      } catch {
        upload = null;
      }
      if (!upload) throw new HttpError(400, "UNKNOWN_UPLOAD", `No upload "${uploadId}" waiting to be sent`);
      const ext = EXTENSION[upload.mime]!;
      const path = `${dir}/${jobId}/files/${first + i}.${ext}`;
      taken.push({
        file: { path, name: upload.name, mime: upload.mime, key: upload.key, width: upload.width, height: upload.height, message },
        from: join(folder, `original.${ext}`),
        folder,
      });
    }
    return taken;
  }

  /** Once the message is stored: the originals go where its files say. */
  async function moveUploads(jobId: string, taken: Awaited<ReturnType<typeof readUploads>>) {
    if (taken.length === 0) return;
    await mkdir(resolve(root, dir, jobId, "files"), { recursive: true });
    for (const { file, from, folder } of taken) {
      await rename(from, resolve(root, file.path));
      await rm(folder, { recursive: true, force: true });
    }
  }

  async function jobResponse(id: string) {
    const job = (await repository.findJob(id))!;
    const draft = await repository.findDraftOfJob(id);
    return IntakeJobResponseSchema.parse({ version: CONTRACT_VERSION, job: toIntakeJob(job, true), draft: draft ? toIntakeDraft(draft) : null });
  }

  app.post("/admin/intake/chats", {
    schema: {
      tags: ["moderation"],
      summary: "Sohbetten Kabul: yeni bir eser için sohbet başlat (ilk mesaj, fotoğrafları, şehir); worker taslağı yazar",
      security: bearer,
      body: toOpenApiSchema(IntakeChatCreateRequestSchema, "input"),
      response: { 201: toOpenApiSchema(IntakeJobResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, community, "moderator");
    const body = parseWith(IntakeChatCreateRequestSchema, request.body, "INVALID_BODY");
    if (!(await repository.cityExists(body.city))) throw new HttpError(400, "UNKNOWN_CODE", `Unknown city "${body.city}"; see GET /meta/enums`);
    const id = randomUUID();
    const taken = await readUploads(id, body.uploads, 0, 0);
    const input: IntakeChatInput = IntakeChatInputSchema.parse({
      messages: [{ text: body.text, at: new Date().toISOString(), by: user.id }],
      files: taken.map((t) => t.file),
      assetId: null,
    });
    await repository.createChatJob({ id, title: chatTitle(body.text), city: body.city, input, createdBy: user.id });
    await moveUploads(id, taken);
    reply.code(201);
    return jobResponse(id);
  });

  app.post("/admin/intake/chats/:id/messages", {
    schema: {
      tags: ["moderation"],
      summary: "Sohbete mesaj ve/veya fotoğraf ekle; worker taslağı yeniden yazar (taslak onay beklerken)",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      body: toOpenApiSchema(IntakeChatMessageRequestSchema, "input"),
      response: { 200: toOpenApiSchema(IntakeJobResponseSchema), 400: errorSchema, 404: errorSchema, 409: errorSchema, ...denied },
    },
  }, async (request) => {
    const user = await requireUser(request, community, "moderator");
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const body = parseWith(IntakeChatMessageRequestSchema, request.body, "INVALID_BODY");
    const job = await repository.findJob(id);
    if (!job || job.kind !== "chat") throw new HttpError(404, "JOB_NOT_FOUND", "No such chat");
    if (job.status === "drafting") throw new HttpError(409, "DRAFTING", "The draft is being written; send the message once it is done");
    const draft = await repository.findDraftOfJob(id);
    if (draft && draft.status !== "pending") throw new HttpError(409, "CHAT_CLOSED", `The draft is already ${draft.status}`);
    const before = IntakeChatInputSchema.safeParse(job.input);
    if (!before.success) throw new HttpError(409, "CHAT_UNREADABLE", "The chat's stored messages cannot be read");
    const { messages, files } = before.data;
    if (messages.length >= INTAKE_CHAT_MAX_MESSAGES) throw new HttpError(400, "TOO_MANY_MESSAGES", `A chat holds at most ${INTAKE_CHAT_MAX_MESSAGES} messages`);
    if (files.length + body.uploads.length > INTAKE_CHAT_MAX_FILES) throw new HttpError(400, "TOO_MANY_PHOTOS", `A chat holds at most ${INTAKE_CHAT_MAX_FILES} photos`);

    const taken = await readUploads(id, body.uploads, messages.length, files.length);
    const input: IntakeChatInput = {
      ...before.data,
      messages: [...messages, { text: body.text, at: new Date().toISOString(), by: user.id }],
      files: [...files, ...taken.map((t) => t.file)],
    };
    if (!(await repository.appendChat(id, input, job.updated_at))) {
      throw new HttpError(409, "DRAFTING", "The chat changed meanwhile (the worker took it up); send the message again once the draft is done");
    }
    await moveUploads(id, taken);
    return jobResponse(id);
  });
};
