/**
 * Integration tests for Ziyaretçi Nabzı against real PostgreSQL (DATABASE_URL) with
 * the dataset imported. Users and contributions created here are deleted afterwards.
 */
import "dotenv/config";
import {
  AnonymousSessionResponseSchema,
  ContributionSchema,
  ModerationItemSchema,
  ModerationListResponseSchema,
  MyContributionsResponseSchema,
  PulseResponseSchema,
} from "@vagabonds/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { CONTRIBUTIONS_PER_HOUR } from "../src/modules/community/community.routes.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const ASSET = "bursa-osmangazi-ulucami";
const OTHER_ASSET = "bursa-osmangazi-orhan-bey-camii";

describe.skipIf(!DATABASE_URL)("Ziyaretçi Nabzı (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  const userIds: string[] = [];
  let moderator: string;

  async function createUser(role: "visitor" | "moderator", nickname = `test-${role}`) {
    const token = newToken();
    const user = await prisma.app_user.create({ data: { nickname, role, token_hash: hashToken(token) } });
    userIds.push(user.id);
    return { id: user.id, token };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function contribute(token: string, body: unknown, asset = ASSET) {
    return app.inject({ method: "POST", url: `/assets/${asset}/contributions`, headers: auth(token), payload: body as object });
  }

  async function pulse(asset = ASSET) {
    const response = await app.inject({ method: "GET", url: `/assets/${asset}/pulse` });
    expect(response.statusCode).toBe(200);
    return PulseResponseSchema.parse(response.json());
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    // The per-IP limit is covered in security.test.ts; here it would only make the order of tests matter.
    app = buildApp({ prisma, rateLimit: false });
    moderator = (await createUser("moderator", "test-moderator")).token;
  });

  afterAll(async () => {
    await prisma.contribution.deleteMany({
      where: { OR: [{ user_id: { in: userIds } }, { reviewed_by: { in: userIds } }] },
    });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  describe("anonymous sessions", () => {
    it("creates a visitor and stores only the token's hash", async () => {
      const response = await app.inject({ method: "POST", url: "/auth/anonymous", payload: { nickname: " Gezgin Ayşe " } });

      expect(response.statusCode).toBe(201);
      const { user, token } = AnonymousSessionResponseSchema.parse(response.json());
      userIds.push(user.id);
      expect(user).toMatchObject({ nickname: "Gezgin Ayşe", role: "visitor" });

      const stored = await prisma.app_user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.token_hash).toBe(hashToken(token));
      expect(stored.token_hash).not.toContain(token);

      const me = await app.inject({ method: "GET", url: "/me", headers: auth(token) });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ id: user.id, role: "visitor" });
    });

    it("rejects invalid nicknames", async () => {
      const response = await app.inject({ method: "POST", url: "/auth/anonymous", payload: { nickname: "<script>" } });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_BODY");
    });

    it("answers 401 without a token or with an unknown one", async () => {
      expect((await app.inject({ method: "GET", url: "/me" })).statusCode).toBe(401);
      const unknown = await app.inject({ method: "GET", url: "/me", headers: auth(newToken()) });
      expect(unknown.statusCode).toBe(401);
      expect(unknown.json().error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("contributions", () => {
    it("accepts a tip as pending, with the text cleaned", async () => {
      const { token } = await createUser("visitor");
      const response = await contribute(token, { kind: "tip", body: "  Cuma öğlen\u0000 avlu çok kalabalık oluyor.  " });

      expect(response.statusCode).toBe(201);
      const contribution = ContributionSchema.parse(response.json());
      expect(contribution).toMatchObject({ assetId: ASSET, kind: "tip", status: "pending", reviewedAt: null });
      expect(contribution.body).toBe("Cuma öğlen avlu çok kalabalık oluyor.");
    });

    it("validates the asset and the body", async () => {
      const { token } = await createUser("visitor");

      const unknownAsset = await contribute(token, { kind: "tip", body: "Burada bir eser var mı?" }, "bursa-yok-boyle-eser");
      expect(unknownAsset.statusCode).toBe(404);
      expect(unknownAsset.json().error.code).toBe("ASSET_NOT_FOUND");

      for (const body of [{ kind: "tip", body: "kısa" }, { kind: "photo", body: "Avludan bir fotoğraf." }, {}]) {
        const response = await contribute(token, body);
        expect(response.statusCode, JSON.stringify(body)).toBe(400);
        expect(response.json().error.code).toBe("INVALID_BODY");
      }
    });

    it("requires a token", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/assets/${ASSET}/contributions`,
        payload: { kind: "tip", body: "Token'sız bir katkı denemesi." },
      });
      expect(response.statusCode).toBe(401);
    });

    it(`limits a user to ${CONTRIBUTIONS_PER_HOUR} contributions per hour`, async () => {
      const { token } = await createUser("visitor");
      for (let i = 0; i < CONTRIBUTIONS_PER_HOUR; i++) {
        expect((await contribute(token, { kind: "memory", body: `Anı numarası ${i + 1}, burada geçti.` })).statusCode).toBe(201);
      }
      const limited = await contribute(token, { kind: "memory", body: "Bir anı daha, ama sınır doldu." });
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe("CONTRIBUTION_LIMIT");
    });
  });

  describe("moderation", () => {
    it("is closed to visitors", async () => {
      const { token } = await createUser("visitor");
      const response = await app.inject({ method: "GET", url: "/admin/contributions", headers: auth(token) });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
    });

    it("shows approved tips and memories in the pulse, never pending ones or corrections", async () => {
      const visitor = await createUser("visitor", "Gezgin");
      const tip = ContributionSchema.parse((await contribute(visitor.token, { kind: "tip", body: "Kuzey kapısı sabah 8'de açılıyor." }, OTHER_ASSET)).json());
      const correction = ContributionSchema.parse((await contribute(visitor.token, { kind: "correction", body: "Minare sayısı yanlış yazılmış." }, OTHER_ASSET)).json());

      expect((await pulse(OTHER_ASSET)).items.find((item) => item.id === tip.id)).toBeUndefined();

      const queue = await app.inject({ method: "GET", url: "/admin/contributions?status=pending&limit=100", headers: auth(moderator) });
      expect(queue.statusCode).toBe(200);
      const pending = ModerationListResponseSchema.parse(queue.json());
      expect(pending.items.map((item) => item.id)).toEqual(expect.arrayContaining([tip.id, correction.id]));
      expect(pending.items.find((item) => item.id === tip.id)?.author).toMatchObject({ nickname: "Gezgin", banned: false });

      for (const id of [tip.id, correction.id]) {
        const approved = await app.inject({ method: "POST", url: `/admin/contributions/${id}/approve`, headers: auth(moderator) });
        expect(approved.statusCode).toBe(200);
        expect(ModerationItemSchema.parse(approved.json())).toMatchObject({ status: "approved", reviewer: { nickname: "test-moderator" } });
      }

      const feed = await pulse(OTHER_ASSET);
      expect(feed.items.find((item) => item.id === tip.id)).toMatchObject({ origin: "community", author: "Gezgin", kind: "tip" });
      expect(feed.items.find((item) => item.id === correction.id)).toBeUndefined();
      expect(feed.communityTotal).toBeGreaterThanOrEqual(1);
    });

    it("does not let a decision be overwritten", async () => {
      const { token } = await createUser("visitor");
      const { id } = ContributionSchema.parse((await contribute(token, { kind: "tip", body: "Abdest alanı yenilenmiş." })).json());

      expect((await app.inject({ method: "POST", url: `/admin/contributions/${id}/approve`, headers: auth(moderator) })).statusCode).toBe(200);
      const again = await app.inject({
        method: "POST",
        url: `/admin/contributions/${id}/reject`,
        headers: auth(moderator),
        payload: { reason: "Yanlışlıkla onaylandı" },
      });
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe("ALREADY_REVIEWED");
    });

    it("requires a reason to reject and shows it to the author", async () => {
      const { token } = await createUser("visitor");
      const { id } = ContributionSchema.parse((await contribute(token, { kind: "tip", body: "Burada ücretsiz otopark var." })).json());

      const noReason = await app.inject({ method: "POST", url: `/admin/contributions/${id}/reject`, headers: auth(moderator), payload: {} });
      expect(noReason.statusCode).toBe(400);

      const rejected = await app.inject({
        method: "POST",
        url: `/admin/contributions/${id}/reject`,
        headers: auth(moderator),
        payload: { reason: "Doğrulanamadı" },
      });
      expect(rejected.statusCode).toBe(200);

      const mine = MyContributionsResponseSchema.parse(
        (await app.inject({ method: "GET", url: "/me/contributions", headers: auth(token) })).json(),
      );
      expect(mine.items.find((item) => item.id === id)).toMatchObject({ status: "rejected", rejectReason: "Doğrulanamadı" });
    });

    it("answers 404 for unknown contributions and 400 for malformed ids", async () => {
      const unknown = await app.inject({ method: "POST", url: `/admin/contributions/${randomUUID()}/approve`, headers: auth(moderator) });
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json().error.code).toBe("CONTRIBUTION_NOT_FOUND");

      const malformed = await app.inject({ method: "POST", url: "/admin/contributions/123/approve", headers: auth(moderator) });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().error.code).toBe("INVALID_ID");
    });

    it("bans a visitor: no more contributions, and their approved items leave the pulse", async () => {
      const visitor = await createUser("visitor", "Spamci");
      const { id } = ContributionSchema.parse((await contribute(visitor.token, { kind: "tip", body: "Yakındaki dükkanıma uğrayın!" })).json());
      await app.inject({ method: "POST", url: `/admin/contributions/${id}/approve`, headers: auth(moderator) });
      expect((await pulse()).items.some((item) => item.id === id)).toBe(true);

      const ban = await app.inject({ method: "POST", url: `/admin/users/${visitor.id}/ban`, headers: auth(moderator) });
      expect(ban.statusCode).toBe(204);

      expect((await pulse()).items.some((item) => item.id === id)).toBe(false);
      const blocked = await contribute(visitor.token, { kind: "tip", body: "Engellendikten sonra bir deneme." });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error.code).toBe("USER_BANNED");
    });

    it("cannot ban moderators", async () => {
      const other = await createUser("moderator", "test-moderator-2");
      const response = await app.inject({ method: "POST", url: `/admin/users/${other.id}/ban`, headers: auth(moderator) });
      expect(response.statusCode).toBe(404);
    });
  });

  it("returns 404 for the pulse of an unknown asset", async () => {
    const response = await app.inject({ method: "GET", url: "/assets/bursa-yok-boyle-eser/pulse" });
    expect(response.statusCode).toBe(404);
  });
});
