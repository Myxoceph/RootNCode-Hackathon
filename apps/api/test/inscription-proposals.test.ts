/**
 * Kitabe Gönüllüleri (docs/plans/veri-dongusu.md H7). The model's answer is turned into a draft by
 * pure functions (tested first); the route runs on real PostgreSQL (DATABASE_URL) with a fake vision
 * model and a local media store in a temporary folder.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { InscriptionDraftSchema, IntakeReviewRequestSchema } from "@vagabonds/contracts";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { createLocalMediaStore } from "../src/modules/admin/media-store.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import {
  InscriptionProposalListResponseSchema,
  InscriptionProposalResponseSchema,
  PROPOSALS_PER_HOUR,
  parsePrompt,
  toDraft,
  toTriage,
  triageChecks,
} from "../src/modules/intake/inscription-proposals.routes.ts";
import { VisionError, type VisionClient, type VisionLook } from "../src/modules/vision/vision.client.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const REPO = resolve(import.meta.dirname, "../../..");

const GOOD = JSON.stringify({
  hasInscription: true,
  alphabet: "arabic",
  lines: 4,
  legible: true,
  problems: ["sol alt köşe kırık"],
  arTarget: true,
  confidence: 0.7,
});

describe("toTriage", () => {
  it("takes the model's JSON, even inside a fence", () => {
    expect(toTriage("```json\n" + GOOD + "\n```")).toEqual({
      hasInscription: true,
      alphabet: "arabic",
      lines: 4,
      legible: true,
      problems: ["sol alt köşe kırık"],
      arTarget: true,
      confidence: 0.7,
    });
  });

  it("leaves out what is off instead of guessing", () => {
    const triage = toTriage(JSON.stringify({ hasInscription: true, alphabet: "ottoman", lines: 2.5, legible: "evet", problems: "x", arTarget: true, confidence: 7 }))!;
    expect(triage).toEqual({ hasInscription: true, alphabet: null, lines: null, legible: false, problems: [], arTarget: false, confidence: null });
    expect(toTriage(JSON.stringify({ hasInscription: false, alphabet: "arabic", legible: true, arTarget: true }))).toMatchObject({ alphabet: null, legible: false, arTarget: false });
    expect(toTriage("Bu bir kitabe.")).toBeNull();
  });
});

describe("toDraft", () => {
  it("holds only the visitor's location: nothing of the model's", () => {
    expect(InscriptionDraftSchema.parse(toDraft("taç kapı"))).toEqual({
      language: null,
      script: null,
      transliteration: null,
      translationTr: null,
      translationEn: null,
      uncertain: [],
      location: "taç kapı",
    });
  });
});

describe("triageChecks", () => {
  it("always has an error, so nothing is approved unread, and gives the model's look as hints", () => {
    const checks = triageChecks(toTriage(GOOD), "kapı", 0, null);
    expect(checks.errors).toHaveLength(1);
    expect(checks.errors[0]).toMatch(/uzman okur/);
    expect(checks.missing).toEqual(["/language", "/script", "/transliteration", "/translationTr", "/translationEn"]);
    expect(checks.warnings.join(" ")).toMatch(/doğrulayın.*Arap harfli.*4 satır.*sol alt köşe/s);
  });

  it("says when the model saw no inscription, could not look, or the asset has some already", () => {
    expect(triageChecks(toTriage(JSON.stringify({ hasInscription: false })), null, 0, null).errors[1]).toMatch(/kitabe görmedi/);
    const failed = triageChecks(null, null, 2, "model şu an yanıt vermiyor");
    expect(failed.warnings.join(" ")).toMatch(/bakamadı.*zaten 2 kitabe/s);
    expect(failed.missing.at(-1)).toBe("/location");
  });
});

describe("the prompt file", () => {
  it("has a version line and the asset's placeholders", async () => {
    const { readFile } = await import("node:fs/promises");
    const prompt = parsePrompt(await readFile(join(REPO, "data/pipeline/prompts/inscription-read.md"), "utf8"));
    expect(prompt.version).toMatch(/^inscription-read-\d+$/);
    expect(prompt.body).toContain("{name}");
    expect(prompt.body).not.toMatch(/^version:/);
  });
});

describe.skipIf(!DATABASE_URL)("inscription proposal routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const media = mkdtempSync(join(tmpdir(), "inscription-media-"));
  const tag = randomUUID().slice(0, 6);
  const userIds: string[] = [];
  let account: string;
  let anonymous: string;
  let moderator: string;
  let assetId: string;
  let photo: Buffer;
  /** What the fake model answers next, and what it was shown. */
  let answer: () => Promise<string>;
  const seen: VisionLook[] = [];
  const vision: VisionClient = {
    look: async (input) => {
      seen.push(input);
      return answer();
    },
  };

  async function createUser(kind: "account" | "anonymous" | "moderator") {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: {
        nickname: `kitabe ${kind} ${tag}`,
        role: kind === "moderator" ? "moderator" : "visitor",
        ...(kind !== "anonymous" && { username: `k${tag}${userIds.length}`, password_hash: "scrypt$test" }),
        sessions: { create: { token_hash: hashToken(token) } },
      },
    });
    userIds.push(user.id);
    return token;
  }

  const send = (token: string, query = "location=ta%C3%A7%20kap%C4%B1&note=Avluda", id = assetId, body = photo) =>
    app.inject({ method: "POST", url: `/assets/${id}/inscription-proposals?${query}`, headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" }, payload: body });

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false, vision, intake: { root: REPO, dir: "data/build/cache/intake", visionModel: "fake-vl" }, mediaStore: createLocalMediaStore(media), mediaBaseUrl: "http://media.test/" });
    account = await createUser("account");
    anonymous = await createUser("anonymous");
    moderator = await createUser("moderator");
    assetId = (await prisma.asset.findFirstOrThrow({ select: { id: true }, orderBy: { id: "asc" } })).id;
    photo = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#b0a090" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: `kitabe-${tag}` } })
      .toBuffer();
  });

  beforeEach(async () => {
    await prisma.intake_draft.deleteMany({ where: { created_by: { in: userIds } } });
    answer = async () => GOOD;
    seen.length = 0;
  });

  afterAll(async () => {
    await prisma.intake_draft.deleteMany({ where: { created_by: { in: userIds } } });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
    rmSync(media, { recursive: true, force: true });
  });

  it("sorts the photo into a draft for the expert; the visitor sees only its state", async () => {
    const response = await send(account);
    expect(response.statusCode).toBe(201);
    const { proposal } = InscriptionProposalResponseSchema.parse(response.json());
    expect(proposal).toMatchObject({ assetId, status: "pending", published: false, reviewNote: null });
    expect(proposal.photo).toBe(`http://media.test/intake/${proposal.id}/1280.jpg`);

    const row = await prisma.intake_draft.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(row).toMatchObject({ kind: "inscription", status: "pending", job_id: null, entry_key: null, note: "Avluda" });
    expect(InscriptionDraftSchema.parse(row.record)).toEqual(toDraft("taç kapı"));
    expect((row.validation as { warnings: string[] }).warnings[0]).toMatch(/Arap harfli/);
    expect(row.media).toEqual([expect.objectContaining({ key: `intake/${proposal.id}/1280.jpg`, subject: "inscription", arTargetCandidate: true })]);
    expect(row.ai).toMatchObject({ model: "fake-vl", promptVersion: expect.stringMatching(/^inscription-read-/), confidence: 0.7 });
    expect(existsSync(join(media, `intake/${proposal.id}/1280.jpg`))).toBe(true);
    // The model sees the processed photo, without the visitor's EXIF, and the asset's name.
    const shown = await sharp(seen[0]!.image).metadata();
    expect(shown.exif).toBeUndefined();
    expect(seen[0]!.system).toContain(assetId.split("-")[0]);
  });

  it("keeps the photo when the model fails, as a draft for the expert to read", async () => {
    answer = async () => {
      throw new VisionError("Vision provider returned HTTP 502");
    };
    const response = await send(account, "");
    expect(response.statusCode).toBe(201);
    const { proposal } = InscriptionProposalResponseSchema.parse(response.json());
    const row = await prisma.intake_draft.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(row.record).toMatchObject({ language: null, transliteration: null, location: null });
    expect((row.validation as { warnings: string[] }).warnings[0]).toMatch(/bakamadı/);
    expect(row.media).toEqual([expect.objectContaining({ arTargetCandidate: false })]);
  });

  it("is approved by an expert with the reading corrected, through the review queue", async () => {
    const { proposal } = InscriptionProposalResponseSchema.parse((await send(account)).json());
    const review = (payload: object) =>
      app.inject({ method: "POST", url: `/admin/intake/drafts/${proposal.id}/review`, headers: { authorization: `Bearer ${moderator}` }, payload });
    // As it is, it has no reading: approved only with the expert's.
    expect((await review({ decision: "approve" })).statusCode).toBe(409);
    const corrected = { language: "ar", script: "sülüs", transliteration: "Bismillah", translationTr: "Allah'ın adıyla", translationEn: null, uncertain: [], location: "taç kapı" };
    const approved = await review(IntakeReviewRequestSchema.parse({ decision: "approve", record: corrected }));
    expect(approved.statusCode).toBe(200);
    const mine = InscriptionProposalListResponseSchema.parse((await app.inject({ url: "/me/inscription-proposals", headers: { authorization: `Bearer ${account}` } })).json());
    expect(mine.items[0]).toMatchObject({ id: proposal.id, status: "approved", published: false });
  });

  it("needs an account, an asset and a photo", async () => {
    expect((await send(anonymous)).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/assets/${assetId}/inscription-proposals`, headers: { "content-type": "image/jpeg" }, payload: photo })).statusCode).toBe(401);
    expect((await send(account, "", "boyle-bir-eser-yok")).statusCode).toBe(404);
    expect((await send(account, "", assetId, Buffer.from("not a photo"))).statusCode).toBe(400);
  });

  it(`takes at most ${PROPOSALS_PER_HOUR} an hour from one account`, async () => {
    for (let i = 0; i < PROPOSALS_PER_HOUR; i++) expect((await send(account, "")).statusCode).toBe(201);
    expect((await send(account, "")).statusCode).toBe(429);
    expect(await prisma.intake_draft.count({ where: { created_by: userIds[0]! } })).toBe(PROPOSALS_PER_HOUR);
  });
});
