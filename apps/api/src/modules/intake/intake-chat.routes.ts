import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
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
/** An upload no message named for this long is swept away. */
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

/** An upload taken by a message: its folder, held under the job, and its file once in place. */
interface Claimed {
  uploadId: string;
  held: string;
  file: IntakeChatFile | null;
}

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
    const keys = photo.variants.map((v) => `intake/${id}/${v.width}.${v.format}`);
    await Promise.all(photo.variants.map((v, i) => store.put(keys[i]!, v.bytes, CONTENT_TYPE[v.format])));
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
    await writeFile(join(folder, "variants.json"), JSON.stringify(keys));
    // upload.json last: until it is there, the upload cannot be sent.
    await writeFile(join(folder, "upload.json"), JSON.stringify(upload));
    void sweepStale().catch((err) => request.log.warn({ err }, "Could not sweep stale intake uploads"));
    reply.code(201);
    return IntakeUploadResponseSchema.parse({ version: CONTRACT_VERSION, upload });
  });

  /**
   * A message's uploads become the chat's files (`<dir>/<job>/files/<n>.<ext>`) before the database
   * hears of them, so the worker never takes up a chat whose photos are not yet in place. Each upload
   * is claimed by moving its folder (one rename: of two requests naming it, one gets it, the other a
   * 400). If anything after fails, `giveBack` puts every upload back as it was, to be sent again.
   */
  async function claimUploads(jobId: string, uploadIds: string[], message: number, first: number) {
    const claimed: Claimed[] = [];
    if (uploadIds.length === 0) return claimed;
    const incoming = resolve(root, dir, jobId, "incoming");
    await mkdir(incoming, { recursive: true });
    await mkdir(resolve(root, dir, jobId, "files"), { recursive: true });
    try {
      for (const [i, uploadId] of uploadIds.entries()) {
        const held = join(incoming, uploadId);
        try {
          await rename(join(uploadsDir, uploadId), held);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(400, "UNKNOWN_UPLOAD", `No upload "${uploadId}" waiting to be sent`);
          throw error;
        }
        const item: Claimed = { uploadId, held, file: null };
        claimed.push(item);
        const upload = IntakeUploadSchema.safeParse(await readFile(join(held, "upload.json"), "utf8").then(JSON.parse).catch(() => null));
        if (!upload.success) throw new HttpError(400, "UNKNOWN_UPLOAD", `Upload "${uploadId}" cannot be read`);
        const { name, mime, key, width, height } = upload.data;
        const ext = EXTENSION[mime]!;
        const file: IntakeChatFile = { path: `${dir}/${jobId}/files/${first + i}.${ext}`, name, mime, key, width, height, message };
        await rename(join(held, `original.${ext}`), resolve(root, file.path));
        item.file = file;
      }
    } catch (error) {
      await giveBack(jobId, claimed);
      throw error;
    }
    return claimed;
  }

  /** The message was turned down: each upload goes back where it waited, and the job's empty folders go. */
  async function giveBack(jobId: string, claimed: Claimed[]) {
    for (const { uploadId, held, file } of claimed) {
      if (file) await rename(resolve(root, file.path), join(held, `original.${EXTENSION[file.mime]}`));
      await rename(held, join(uploadsDir, uploadId));
    }
    // rmdir, not rm: a folder that still holds anything (an earlier message's photos) stays.
    for (const folder of ["incoming", "files", ""]) await rmdir(resolve(root, dir, jobId, folder)).catch(() => {});
  }

  /** The message is stored: what is left of its uploads (their upload.json) goes. */
  async function settle(jobId: string, claimed: Claimed[]) {
    if (claimed.length === 0) return;
    for (const { held } of claimed) await rm(held, { recursive: true, force: true });
    await rmdir(resolve(root, dir, jobId, "incoming")).catch(() => {});
  }

  /** Uploads no message named within a day: the original and its processed photos go. */
  async function sweepStale() {
    if (!store) return;
    const now = Date.now();
    for (const name of await readdir(uploadsDir).catch(() => [])) {
      const folder = join(uploadsDir, name);
      const info = await stat(folder).catch(() => null);
      if (!info?.isDirectory() || now - info.mtimeMs < STALE_UPLOAD_MS) continue;
      const keys = await readFile(join(folder, "variants.json"), "utf8").then(JSON.parse).catch(() => []);
      if (Array.isArray(keys)) for (const key of keys) if (typeof key === "string" && key.startsWith(`intake/${name}/`)) await store.remove(key).catch(() => {});
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
    const claimed = await claimUploads(id, body.uploads, 0, 0);
    try {
      const input: IntakeChatInput = IntakeChatInputSchema.parse({
        messages: [{ text: body.text, at: new Date().toISOString(), by: user.id }],
        files: claimed.map((c) => c.file!),
        assetId: null,
      });
      await repository.createChatJob({ id, title: chatTitle(body.text), city: body.city, input, createdBy: user.id });
    } catch (error) {
      await giveBack(id, claimed);
      throw error;
    }
    await settle(id, claimed);
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

    const claimed = await claimUploads(id, body.uploads, messages.length, files.length);
    let result: Awaited<ReturnType<IntakeRepository["appendChat"]>>;
    try {
      const input: IntakeChatInput = {
        ...before.data,
        messages: [...messages, { text: body.text, at: new Date().toISOString(), by: user.id }],
        files: [...files, ...claimed.map((c) => c.file!)],
      };
      result = await repository.appendChat(id, job.input, input);
    } catch (error) {
      await giveBack(id, claimed);
      throw error;
    }
    if (result !== "ok") {
      await giveBack(id, claimed);
      if (result === "closed") throw new HttpError(409, "CHAT_CLOSED", "The draft was decided meanwhile");
      throw new HttpError(409, "CHAT_CHANGED", "The chat changed meanwhile (another message, or the worker took it up); send the message again");
    }
    await settle(id, claimed);
    return jobResponse(id);
  });
};
