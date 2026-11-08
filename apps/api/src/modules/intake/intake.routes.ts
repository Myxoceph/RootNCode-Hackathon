import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  AssetIdSchema,
  CONTRACT_VERSION,
  INTAKE_PDF_MAX_BYTES,
  IntakeDraftListQuerySchema,
  IntakeDraftListResponseSchema,
  IntakeDraftResponseSchema,
  IntakeJobCreateQuerySchema,
  IntakeJobListResponseSchema,
  IntakeJobResponseSchema,
  IntakeMapConfirmRequestSchema,
  IntakeReviewRequestSchema,
  InscriptionDraftSchema,
  type BookMapEntry,
} from "@vagabonds/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.ts";
import { parseWith } from "../../lib/validate.ts";
import { ErrorResponseSchema } from "../../plugins/error-handler.ts";
import { toOpenApiSchema } from "../../plugins/openapi.ts";
import { requireUser } from "../community/auth.ts";
import type { CommunityRepository } from "../community/community.repository.ts";
import { toIntakeDraft, toIntakeJob, type IntakeRepository } from "./intake.repository.ts";

export interface IntakeRoutesOptions {
  repository: IntakeRepository;
  /** For signing in the caller. */
  community: CommunityRepository;
  /** The repo's root: job files are kept under it, by paths relative to it (the worker reads them). */
  root: string;
  /** Where uploaded PDFs go, relative to `root`: `data/build/cache/intake` (not in git). */
  dir: string;
}

const IdParamsSchema = z.object({ id: z.uuid() });

/** The asset kinds a draft adds as a new asset (an inscription adds to one that exists). */
const NEW_ASSET_KINDS = new Set(["book_asset", "field_asset"]);

/** A whole corrected record (sections, timeline…) is larger than the API's usual 16 KB body. */
const REVIEW_BODY_LIMIT = 2 * 1024 * 1024;

/**
 * Why a book map cannot be confirmed: keys and proposed ids must be unique, parents must exist and
 * lead to a top entry (no loops: the worker walks them to link a complex and its buildings).
 * Page ranges are checked by the contract itself.
 */
export function bookMapProblems(entries: BookMapEntry[]): string[] {
  const problems: string[] = [];
  const parents = new Map<string, string | null>();
  const ids = new Set<string>();
  for (const entry of entries) {
    if (parents.has(entry.key)) problems.push(`key "${entry.key}" appears twice`);
    parents.set(entry.key, entry.parentKey);
    if (entry.proposedId) {
      if (ids.has(entry.proposedId)) problems.push(`id "${entry.proposedId}" is proposed twice`);
      ids.add(entry.proposedId);
    }
  }
  for (const entry of entries) {
    if (entry.parentKey === entry.key) problems.push(`"${entry.key}" is its own parent`);
    else if (entry.parentKey && !parents.has(entry.parentKey)) problems.push(`"${entry.key}": parent "${entry.parentKey}" is not in the map`);
  }
  if (problems.length > 0) return problems;
  for (const entry of entries) {
    const seen = new Set<string>([entry.key]);
    for (let parent = entry.parentKey; parent !== null; parent = parents.get(parent) ?? null) {
      if (seen.has(parent)) {
        problems.push(`"${entry.key}": its parents go round in a loop`);
        break;
      }
      seen.add(parent);
    }
  }
  return problems;
}

/**
 * Veri Döngüsü's review queue and book intake (docs/plans/veri-dongusu.md §4-5), for moderators and
 * admins. Registered only with INTAKE_ENABLED. The Python worker does the work in between: it reads
 * jobs and writes drafts in the same tables, and publishes what is approved here.
 */
export const intakeRoutes: FastifyPluginAsync<IntakeRoutesOptions> = async (app, { repository, community, root, dir }) => {
  const errorSchema = toOpenApiSchema(ErrorResponseSchema);
  const denied = { 401: errorSchema, 403: errorSchema };
  const bearer = [{ bearerAuth: [] }];
  const jobNotFound = () => new HttpError(404, "JOB_NOT_FOUND", "No such intake job");
  const draftNotFound = () => new HttpError(404, "DRAFT_NOT_FOUND", "No such draft");

  // Only in this plugin: the rest of the API keeps its 16 KB JSON body limit.
  app.addContentTypeParser("application/pdf", { parseAs: "buffer", bodyLimit: INTAKE_PDF_MAX_BYTES }, (_request, body, done) => done(null, body));

  app.post("/admin/intake/jobs", {
    bodyLimit: INTAKE_PDF_MAX_BYTES,
    // Before the body is read: a caller without the role must not make the API take in 200 MB.
    onRequest: async (request) => {
      await requireUser(request, community, "moderator");
    },
    schema: {
      tags: ["moderation"],
      summary: "PDF Kabul: bir envanter kitabının PDF'ini yükle; worker onu böler ve kitap haritasını önerir",
      description: `Gövde PDF'in kendisi (application/pdf), en çok ${INTAKE_PDF_MAX_BYTES / 1024 / 1024} MB. Yalnızca INTAKE_ENABLED ile.`,
      security: bearer,
      querystring: toOpenApiSchema(IntakeJobCreateQuerySchema, "input"),
      response: { 201: toOpenApiSchema(IntakeJobResponseSchema), 400: errorSchema, 413: errorSchema, 415: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, community, "moderator");
    const query = parseWith(IntakeJobCreateQuerySchema, request.query, "INVALID_QUERY");
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new HttpError(400, "INVALID_PDF", "Send the PDF itself as application/pdf");
    }
    if (!(await repository.cityExists(query.city))) throw new HttpError(400, "UNKNOWN_CODE", `Unknown city "${query.city}"; see GET /meta/enums`);

    const id = randomUUID();
    const filePath = `${dir}/${id}/source.pdf`;
    const absolute = resolve(root, filePath);
    try {
      // A write cut short (a full disk) leaves no half file without a job behind.
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, body);
      const job = await repository.createJob({ id, title: query.title, city: query.city, sourceId: query.sourceId ?? null, filePath, createdBy: user.id });
      reply.code(201);
      return IntakeJobResponseSchema.parse({ version: CONTRACT_VERSION, job: toIntakeJob(job) });
    } catch (error) {
      await rm(dirname(absolute), { recursive: true, force: true });
      throw error;
    }
  });

  app.get("/admin/intake/jobs", {
    schema: {
      tags: ["moderation"],
      summary: "PDF Kabul işleri, en yenisi önce",
      security: bearer,
      response: { 200: toOpenApiSchema(IntakeJobListResponseSchema), ...denied },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "moderator");
    reply.header("cache-control", "no-store");
    return IntakeJobListResponseSchema.parse({ version: CONTRACT_VERSION, items: (await repository.listJobs()).map((job) => toIntakeJob(job)) });
  });

  app.get("/admin/intake/jobs/:id", {
    schema: {
      tags: ["moderation"],
      summary: "Bir PDF Kabul işi: durumu, ilerlemesi, kitap haritası",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 200: toOpenApiSchema(IntakeJobResponseSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "moderator");
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const job = await repository.findJob(id);
    if (!job) throw jobNotFound();
    reply.header("cache-control", "no-store");
    // A chat comes with its messages and, once the worker wrote it, its draft (the panel polls this).
    const draft = job.kind === "chat" ? await repository.findDraftOfJob(id) : null;
    return IntakeJobResponseSchema.parse({ version: CONTRACT_VERSION, job: toIntakeJob(job, true), draft: draft ? toIntakeDraft(draft) : null });
  });

  app.post("/admin/intake/jobs/:id/map", {
    schema: {
      tags: ["moderation"],
      summary: "Kitap haritasını onayla (düzeltilmiş hâliyle); worker eser başına taslak yazmaya başlar",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      body: toOpenApiSchema(IntakeMapConfirmRequestSchema, "input"),
      response: { 200: toOpenApiSchema(IntakeJobResponseSchema), 400: errorSchema, 404: errorSchema, 409: errorSchema, ...denied },
    },
  }, async (request) => {
    const user = await requireUser(request, community, "moderator");
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const input = parseWith(IntakeMapConfirmRequestSchema, request.body, "INVALID_BODY");
    const problems = bookMapProblems(input.bookMap);
    if (problems.length > 0) throw new HttpError(400, "INVALID_MAP", problems.join("; "));
    const job = await repository.findJob(id);
    if (!job || job.kind !== "pdf") throw jobNotFound();
    if (!(await repository.confirmMap(id, input.bookMap, input.sourceId, user.id))) {
      // Read again: another moderator may have confirmed it a moment ago.
      const now = (await repository.findJob(id))?.status ?? job.status;
      throw new HttpError(409, "NOT_WAITING_FOR_MAP", `The job is "${now}"; a map is confirmed only while it is "needs_map"`);
    }
    return IntakeJobResponseSchema.parse({ version: CONTRACT_VERSION, job: toIntakeJob((await repository.findJob(id))!) });
  });

  app.get("/admin/intake/drafts", {
    schema: {
      tags: ["moderation"],
      summary: "Onay kuyruğu: kitaptan, ziyaretçiden ve sahadan gelen taslaklar, en eskisi önce",
      security: bearer,
      querystring: toOpenApiSchema(IntakeDraftListQuerySchema, "input"),
      response: { 200: toOpenApiSchema(IntakeDraftListResponseSchema), 400: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "moderator");
    const query = parseWith(IntakeDraftListQuerySchema, request.query, "INVALID_QUERY");
    const { total, rows } = await repository.listDrafts(query);
    reply.header("cache-control", "no-store");
    return IntakeDraftListResponseSchema.parse({ version: CONTRACT_VERSION, total, items: rows.map(toIntakeDraft) });
  });

  app.get("/admin/intake/drafts/:id", {
    schema: {
      tags: ["moderation"],
      summary: "Bir taslak: kaydı, fotoğrafları, kaynak sayfaları, doğrulama sonucu",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      response: { 200: toOpenApiSchema(IntakeDraftResponseSchema), 400: errorSchema, 404: errorSchema, ...denied },
    },
  }, async (request, reply) => {
    await requireUser(request, community, "moderator");
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const draft = await repository.findDraft(id);
    if (!draft) throw draftNotFound();
    reply.header("cache-control", "no-store");
    return IntakeDraftResponseSchema.parse({ version: CONTRACT_VERSION, draft: toIntakeDraft(draft) });
  });

  app.post("/admin/intake/drafts/:id/review", {
    bodyLimit: REVIEW_BODY_LIMIT,
    schema: {
      tags: ["moderation"],
      summary: "Taslağı onayla (düzeltilmiş kaydıyla) ya da reddet; onaylananı worker yayınlar",
      security: bearer,
      params: toOpenApiSchema(IdParamsSchema, "input"),
      body: toOpenApiSchema(IntakeReviewRequestSchema, "input"),
      response: { 200: toOpenApiSchema(IntakeDraftResponseSchema), 400: errorSchema, 404: errorSchema, 409: errorSchema, ...denied },
    },
  }, async (request) => {
    const user = await requireUser(request, community, "moderator");
    const { id } = parseWith(IdParamsSchema, request.params, "INVALID_ID");
    const input = parseWith(IntakeReviewRequestSchema, request.body, "INVALID_BODY");
    const draft = await repository.findDraft(id);
    if (!draft) throw draftNotFound();
    // A new asset is published by its approval: that is an admin's call, as editing assets is. A
    // visitor's inscription stays with moderators, as visitors' notes do.
    if (NEW_ASSET_KINDS.has(draft.kind) && user.role !== "admin") throw new HttpError(403, "FORBIDDEN", "Only an admin decides on a new asset");
    if (draft.status !== "pending") throw new HttpError(409, "ALREADY_REVIEWED", `The draft is already ${draft.status}`);

    let decided: "ok" | "decided" | "taken";
    if (input.decision === "reject") {
      decided = await repository.review(id, { status: "rejected" }, input.note, user.id);
    } else {
      const current = toIntakeDraft(draft);
      if (!input.record && current.validation.errors.length > 0) {
        throw new HttpError(409, "HAS_ERRORS", `The record has ${current.validation.errors.length} validation error(s); approve it with the record corrected`);
      }
      let record = input.record ?? current.record;
      // A corrected inscription is held to its contract; a dataset record is checked by validate.py when published.
      if (draft.kind === "inscription" && input.record) record = parseWith(InscriptionDraftSchema, input.record, "INVALID_RECORD");
      let assetId = draft.asset_id;
      if (NEW_ASSET_KINDS.has(draft.kind)) {
        // The reviewer may have renamed the asset: its id is the record's.
        const parsed = AssetIdSchema.safeParse(record["id"] ?? draft.asset_id);
        if (!parsed.success) throw new HttpError(400, "INVALID_ID", "The record's id must be lowercase kebab-case");
        assetId = parsed.data;
        if (await repository.assetExists(assetId)) throw new HttpError(409, "ASSET_EXISTS", `An asset "${assetId}" already exists; give the record another id`);
        // Approval is the review: the asset is published once the worker has written it. The dataset
        // keeps a record's state in its meta (data/schema/eser.schema.json; no other field may be added).
        const meta = record["meta"] && typeof record["meta"] === "object" && !Array.isArray(record["meta"]) ? (record["meta"] as Record<string, unknown>) : {};
        record = {
          ...record,
          id: assetId,
          meta: { ...meta, status: "published", reviewed_by: user.username ?? user.nickname, updated_at: new Date().toISOString().slice(0, 10) },
        };
      } else if (!(await repository.assetExists(assetId))) {
        throw new HttpError(409, "ASSET_GONE", `The asset "${assetId}" this draft adds to no longer exists`);
      }
      decided = await repository.review(id, { status: "approved", assetId, record }, input.note ?? null, user.id);
    }
    if (decided === "decided") throw new HttpError(409, "ALREADY_REVIEWED", "Someone else decided this draft first");
    if (decided === "taken") throw new HttpError(409, "ASSET_EXISTS", "Another draft is already approved as this asset; give the record another id");
    return IntakeDraftResponseSchema.parse({ version: CONTRACT_VERSION, draft: toIntakeDraft((await repository.findDraft(id))!) });
  });
};
