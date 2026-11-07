/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset imported. Veri Döngüsü's book
 * intake and review queue (docs/plans/veri-dongusu.md, Y1); the worker's part is played by writing
 * the tables directly, as it would.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IntakeDraftListResponseSchema, IntakeDraftResponseSchema, IntakeJobListResponseSchema, IntakeJobResponseSchema, type BookMapEntry } from "@vagabonds/contracts";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { bookMapProblems } from "../src/modules/intake/intake.routes.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
/** In the dataset: an inscription draft adds to it. */
const EXISTING = "bursa-osmangazi-ulucami";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

const entry = (key: string, overrides: Partial<BookMapEntry> = {}): BookMapEntry => ({
  key,
  titleTr: `Eser ${key}`,
  titleEn: null,
  district: "Osmangazi",
  printedPages: [10, 12],
  pdfPages: [6, 7],
  parentKey: null,
  proposedId: null,
  ...overrides,
});

describe("bookMapProblems", () => {
  it("passes a sound map and names what is wrong with a broken one", () => {
    expect(bookMapProblems([entry("a"), entry("b", { parentKey: "a" })])).toEqual([]);
    expect(bookMapProblems([entry("a"), entry("a")])).toEqual([expect.stringContaining("twice")]);
    expect(bookMapProblems([entry("a", { parentKey: "a" })])).toEqual([expect.stringContaining("own parent")]);
    expect(bookMapProblems([entry("a", { parentKey: "z" })])).toEqual([expect.stringContaining("not in the map")]);
    expect(bookMapProblems([entry("a", { proposedId: "x" }), entry("b", { proposedId: "x" })])).toEqual([expect.stringContaining("proposed twice")]);
    expect(bookMapProblems([entry("a", { printedPages: [12, 10] })])).toEqual([expect.stringContaining("backwards")]);
  });
});

describe.skipIf(!DATABASE_URL)("intake routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const root = mkdtempSync(join(tmpdir(), "intake-root-"));
  const userIds: string[] = [];
  const jobIds: string[] = [];
  const draftIds: string[] = [];
  const tag = randomUUID().slice(0, 6);
  let moderator: string;
  let visitor: string;

  async function createUser(role: "visitor" | "moderator" | "admin") {
    const token = newToken();
    const user = await prisma.app_user.create({ data: { nickname: `intake ${role} ${tag}`, role, sessions: { create: { token_hash: hashToken(token) } } } });
    userIds.push(user.id);
    return token;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const json = (method: "GET" | "POST", url: string, token: string, payload?: object) =>
    app.inject({ method, url, headers: auth(token), ...(payload && { payload }) });
  const upload = (token: string, query: string, body: Buffer, type = "application/pdf") =>
    app.inject({ method: "POST", url: `/admin/intake/jobs?${query}`, headers: { ...auth(token), "content-type": type }, payload: body });

  /** A job the worker has read: waiting for its map. */
  async function jobNeedingMap() {
    const job = await prisma.intake_job.create({
      data: { title: `Kitap ${tag}`, city: "bursa", file_path: "x.pdf", status: "needs_map", book_map: [entry("a")] as object[] },
    });
    jobIds.push(job.id);
    return job.id;
  }

  /** A draft as the worker writes it. */
  async function bookDraft(jobId: string, key: string, data: { errors?: string[]; assetId?: string } = {}) {
    const draft = await prisma.intake_draft.create({
      data: {
        kind: "book_asset",
        job_id: jobId,
        entry_key: key,
        asset_id: data.assetId ?? `bursa-osmangazi-intake-${tag}-${key}`,
        record: { id: data.assetId ?? `bursa-osmangazi-intake-${tag}-${key}`, name: { tr: `Eser ${key}` }, status: "draft" },
        validation: { errors: data.errors ?? [], warnings: [] },
      },
    });
    return draft.id;
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false, intake: { root, dir: "data/build/cache/intake" } });
    moderator = await createUser("moderator");
    visitor = await createUser("visitor");
  });

  afterAll(async () => {
    await prisma.intake_draft.deleteMany({ where: { id: { in: draftIds } } });
    await prisma.intake_job.deleteMany({ where: { OR: [{ id: { in: jobIds } }, { created_by: { in: userIds } }] } });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });

  it("takes a book's PDF from a moderator and keeps it where the worker reads it", async () => {
    const response = await upload(moderator, "title=Bursa%20Vak%C4%B1f%20Eserleri&city=bursa", PDF);
    expect(response.statusCode).toBe(201);
    const { job } = IntakeJobResponseSchema.parse(response.json());
    jobIds.push(job.id);
    expect(job).toMatchObject({ status: "queued", city: "bursa", title: "Bursa Vakıf Eserleri", bookMap: null, progress: { done: 0, total: 0 } });
    const row = await prisma.intake_job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.file_path).toBe(`data/build/cache/intake/${job.id}/source.pdf`);
    expect(readFileSync(join(root, row.file_path))).toEqual(PDF);

    const list = IntakeJobListResponseSchema.parse((await json("GET", "/admin/intake/jobs", moderator)).json());
    expect(list.items.map((j) => j.id)).toContain(job.id);
  });

  it("turns away what is not a PDF, an unknown city and a visitor", async () => {
    expect((await upload(moderator, "title=Kitap&city=bursa", Buffer.from("<html>not a pdf</html>"))).statusCode).toBe(400);
    expect((await upload(moderator, "title=Kitap&city=atlantis", PDF)).statusCode).toBe(400);
    expect((await upload(visitor, "title=Kitap&city=bursa", PDF)).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/admin/intake/jobs" })).statusCode).toBe(401);
    // Nothing of them was kept.
    expect(existsSync(join(root, "data/build/cache/intake"))).toBe(true);
    const kept = await prisma.intake_job.count({ where: { created_by: { in: userIds }, title: "Kitap" } });
    expect(kept).toBe(0);
  });

  it("confirms the book map once, only while the job waits for it", async () => {
    const id = await jobNeedingMap();
    const map = [entry("kulliye", { proposedId: `bursa-osmangazi-k-${tag}` }), entry("cami", { parentKey: "kulliye" })];

    expect((await json("POST", `/admin/intake/jobs/${id}/map`, moderator, { bookMap: [entry("a"), entry("a")] })).statusCode).toBe(400);

    const confirmed = await json("POST", `/admin/intake/jobs/${id}/map`, moderator, { bookMap: map, sourceId: "vk-bursa-c1" });
    expect(confirmed.statusCode).toBe(200);
    const { job } = IntakeJobResponseSchema.parse(confirmed.json());
    expect(job).toMatchObject({ status: "map_confirmed", sourceId: "vk-bursa-c1", progress: { done: 0, total: 2 } });
    expect(job.bookMap).toEqual(map);
    expect(job.mapConfirmedAt).not.toBeNull();

    // A second confirmation (another tab, a double tap) finds it already moved on.
    expect((await json("POST", `/admin/intake/jobs/${id}/map`, moderator, { bookMap: map })).statusCode).toBe(409);
    expect((await json("POST", `/admin/intake/jobs/${randomUUID()}/map`, moderator, { bookMap: map })).statusCode).toBe(404);
  });

  it("lists the queue oldest first, by status, kind and job", async () => {
    const id = await jobNeedingMap();
    const first = await bookDraft(id, "q1");
    const second = await bookDraft(id, "q2");
    const response = await json("GET", `/admin/intake/drafts?jobId=${id}`, moderator);
    const list = IntakeDraftListResponseSchema.parse(response.json());
    expect(list.total).toBe(2);
    expect(list.items.map((d) => d.id)).toEqual([first, second]);
    expect(list.items[0]).toMatchObject({ kind: "book_asset", status: "pending", entryKey: "q1", appliedAt: null, applyError: null });

    const none = IntakeDraftListResponseSchema.parse((await json("GET", `/admin/intake/drafts?jobId=${id}&status=approved`, moderator)).json());
    expect(none.total).toBe(0);
    expect((await json("GET", `/admin/intake/drafts?status=maybe`, moderator)).statusCode).toBe(400);
  });

  it("approves a book draft as a published record for the worker, and only once", async () => {
    const id = await jobNeedingMap();
    const draftId = await bookDraft(id, "ok");
    const response = await json("POST", `/admin/intake/drafts/${draftId}/review`, moderator, { decision: "approve", note: "kitapla karşılaştırıldı" });
    expect(response.statusCode).toBe(200);
    const { draft } = IntakeDraftResponseSchema.parse(response.json());
    expect(draft).toMatchObject({ status: "approved", reviewNote: "kitapla karşılaştırıldı", appliedAt: null });
    expect(draft.record).toMatchObject({ status: "published", id: draft.assetId });
    expect(draft.reviewedAt).not.toBeNull();

    expect((await json("POST", `/admin/intake/drafts/${draftId}/review`, moderator, { decision: "reject", note: "geç kaldım" })).statusCode).toBe(409);
  });

  it("takes the reviewer's corrected record and new id, but not an id already in the dataset", async () => {
    const id = await jobNeedingMap();
    const draftId = await bookDraft(id, "fix", { errors: ["dating: year missing"] });

    // Errors: approved only with the record corrected.
    expect((await json("POST", `/admin/intake/drafts/${draftId}/review`, moderator, { decision: "approve" })).statusCode).toBe(409);
    // The corrected record names an asset that exists.
    const taken = await json("POST", `/admin/intake/drafts/${draftId}/review`, moderator, { decision: "approve", record: { id: EXISTING } });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe("ASSET_EXISTS");

    const renamed = `bursa-osmangazi-duzeltilmis-${tag}`;
    const response = await json("POST", `/admin/intake/drafts/${draftId}/review`, moderator, {
      decision: "approve",
      record: { id: renamed, name: { tr: "Düzeltilmiş Eser" }, dating: { year: 1399 } },
    });
    expect(response.statusCode).toBe(200);
    const { draft } = IntakeDraftResponseSchema.parse(response.json());
    expect(draft.assetId).toBe(renamed);
    expect(draft.record).toEqual({ id: renamed, name: { tr: "Düzeltilmiş Eser" }, dating: { year: 1399 }, status: "published" });
  });

  it("rejects with a reason, and keeps a visitor's inscription on the asset it adds to", async () => {
    const id = await jobNeedingMap();
    const draftId = await bookDraft(id, "no");
    expect((await json("POST", `/admin/intake/drafts/${draftId}/review`, moderator, { decision: "reject" })).statusCode).toBe(400);
    const rejected = await json("POST", `/admin/intake/drafts/${draftId}/review`, moderator, { decision: "reject", note: "kitapta yok" });
    expect(IntakeDraftResponseSchema.parse(rejected.json()).draft).toMatchObject({ status: "rejected", reviewNote: "kitapta yok" });

    const inscription = await prisma.intake_draft.create({
      data: { kind: "inscription", asset_id: EXISTING, record: { transliteration: "…", uncertain: [] } },
    });
    draftIds.push(inscription.id);
    const approved = await json("POST", `/admin/intake/drafts/${inscription.id}/review`, moderator, { decision: "approve" });
    expect(approved.statusCode).toBe(200);
    expect(IntakeDraftResponseSchema.parse(approved.json()).draft).toMatchObject({ status: "approved", assetId: EXISTING });
  });

  it("is for moderators only, and not there without INTAKE_ENABLED", async () => {
    expect((await json("GET", "/admin/intake/drafts", visitor)).statusCode).toBe(403);
    const plain = buildApp({ prisma, rateLimit: false });
    expect((await plain.inject({ method: "GET", url: "/admin/intake/drafts", headers: auth(moderator) })).statusCode).toBe(404);
    await plain.close();
  });
});
