/**
 * Integration tests for Ziyaretçi Nabzı against real PostgreSQL (DATABASE_URL) with
 * the dataset imported. Users and contributions created here are deleted afterwards.
 */
import "dotenv/config";
import {
  AnonymousSessionResponseSchema,
  AppUserSchema,
  ContributionSchema,
  ModerationItemSchema,
  ModerationListResponseSchema,
  MyContributionsResponseSchema,
  PulseResponseSchema,
  SessionResponseSchema,
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

  async function createUser(role: "visitor" | "moderator" | "admin", nickname = `test-${role}`) {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: { nickname, role, sessions: { create: { token_hash: hashToken(token) } } },
    });
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

      const sessions = await prisma.user_session.findMany({ where: { user_id: user.id } });
      expect(sessions.map((s) => s.token_hash)).toEqual([hashToken(token)]);
      expect(user.username).toBeNull();

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

  describe("accounts", () => {
    // Usernames are unique; a suffix keeps reruns against the same database apart.
    const suffix = randomUUID().slice(0, 8);
    const name = (base: string) => `${base}_${suffix}`;

    // Each account needs its own e-mail; one made from the username unless the test gives it.
    const mail = (username: unknown) => `${String(username).toLowerCase()}@ornek.test`;

    async function register(payload: { username: string } & Record<string, unknown>, status = 201) {
      const response = await app.inject({ method: "POST", url: "/auth/register", payload: { email: mail(payload.username), ...payload } });
      expect(response.statusCode, response.body).toBe(status);
      if (status !== 201) return { error: response.json().error.code as string };
      const session = SessionResponseSchema.parse(response.json());
      userIds.push(session.user.id);
      return session;
    }

    function login(username: string, password: string) {
      return app.inject({ method: "POST", url: "/auth/login", payload: { username, password } });
    }

    it("registers with a lowercase username and stores only a scrypt hash of the password", async () => {
      const session = await register({ username: name("Ayse.Gezgin").toUpperCase(), password: "kubbe-altinda-42" });
      if (!("user" in session)) throw new Error("expected a session");
      expect(session.user).toMatchObject({
        username: name("ayse.gezgin"),
        nickname: name("ayse.gezgin"),
        role: "visitor",
        email: mail(name("ayse.gezgin")),
        fullName: null,
        photoUrl: null,
      });

      const stored = await prisma.app_user.findUniqueOrThrow({ where: { id: session.user.id } });
      expect(stored.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
      expect(stored.password_hash).not.toContain("kubbe-altinda-42");
      expect((await app.inject({ method: "GET", url: "/me", headers: auth(session.token) })).statusCode).toBe(200);
    });

    it("rejects a taken username, whatever its case, and invalid input", async () => {
      await register({ username: name("taken"), password: "yeterince-uzun" });
      expect(await register({ username: name("TAKEN"), password: "baska-bir-parola" }, 409)).toEqual({ error: "USERNAME_TAKEN" });
      expect(await register({ username: "a", password: "yeterince-uzun" }, 400)).toEqual({ error: "INVALID_BODY" });
      expect(await register({ username: name("kisa"), password: "1234567" }, 400)).toEqual({ error: "INVALID_BODY" });
    });

    it("needs an e-mail, keeps it lowercase and gives each address one account", async () => {
      const session = await register({ username: name("posta"), password: "yeterince-uzun", email: ` ${name("Posta")}@Ornek.TEST ` });
      if (!("user" in session)) throw new Error("expected a session");
      expect(session.user.email).toBe(`${name("posta")}@ornek.test`);

      const same = { password: "yeterince-uzun", email: `${name("POSTA")}@ornek.test` };
      expect(await register({ username: name("posta2"), ...same }, 409)).toEqual({ error: "EMAIL_TAKEN" });
      expect(await register({ username: name("posta3"), password: "yeterince-uzun", email: "posta-degil" }, 400)).toEqual({ error: "INVALID_BODY" });
      const without = await app.inject({ method: "POST", url: "/auth/register", payload: { username: name("posta4"), password: "yeterince-uzun" } });
      expect([without.statusCode, without.json().error.code]).toEqual([400, "INVALID_BODY"]);
    });

    it("keeps a full name, and changes it or the nickname with PATCH /me", async () => {
      const session = await register({ username: name("adli"), password: "yeterince-uzun", fullName: "  Ayşe   Yılmaz " });
      if (!("user" in session)) throw new Error("expected a session");
      expect(session.user.fullName).toBe("Ayşe Yılmaz");

      const patch = (payload: object) => app.inject({ method: "PATCH", url: "/me", headers: auth(session.token), payload });
      const renamed = await patch({ nickname: "Kubbe Sever", fullName: "Ayşe Nur Yılmaz" });
      expect(renamed.statusCode, renamed.body).toBe(200);
      expect(AppUserSchema.parse(renamed.json())).toMatchObject({ nickname: "Kubbe Sever", fullName: "Ayşe Nur Yılmaz" });
      expect(AppUserSchema.parse((await patch({ fullName: null })).json())).toMatchObject({ nickname: "Kubbe Sever", fullName: null });
      expect((await patch({})).statusCode).toBe(400);
      expect((await patch({ fullName: "<script>" })).statusCode).toBe(400);
      expect((await app.inject({ method: "PATCH", url: "/me", payload: { fullName: "Ayşe" } })).statusCode).toBe(401);
    });

    it("signs in with a new token per device and the same answer for a wrong password or an unknown user", async () => {
      const first = await register({ username: name("iki.cihaz"), password: "dogru-parola-1", nickname: "İki Cihaz" });
      if (!("token" in first)) throw new Error("expected a session");

      const second = await login(name("IKI.CIHAZ"), "dogru-parola-1");
      expect(second.statusCode).toBe(200);
      const { token, user } = SessionResponseSchema.parse(second.json());
      expect(token).not.toBe(first.token);
      expect(user).toMatchObject({ nickname: "İki Cihaz" });

      const wrong = await login(name("iki.cihaz"), "yanlis-parola");
      const unknown = await login(name("hic.yok"), "dogru-parola-1");
      expect([wrong.statusCode, unknown.statusCode]).toEqual([401, 401]);
      expect(wrong.json()).toEqual(unknown.json());

      // Signing out ends only this device's session.
      expect((await app.inject({ method: "POST", url: "/auth/logout", headers: auth(token) })).statusCode).toBe(204);
      expect((await app.inject({ method: "GET", url: "/me", headers: auth(token) })).statusCode).toBe(401);
      expect((await app.inject({ method: "GET", url: "/me", headers: auth(first.token) })).statusCode).toBe(200);
    });

    it("turns an anonymous visitor into an account that keeps its contributions", async () => {
      const { token } = await createUser("visitor", "Anonim Gezgin");
      expect((await contribute(token, { kind: "memory", body: "Çocukken burada top oynardık." })).statusCode).toBe(201);

      const upgrade = (payload: object) => app.inject({ method: "POST", url: "/auth/upgrade", headers: auth(token), payload });
      const upgraded = await upgrade({ username: name("eski.anonim"), password: "artik-hesabim-var", email: mail(name("eski.anonim")) });
      expect(upgraded.statusCode, upgraded.body).toBe(200);
      expect(AppUserSchema.parse(upgraded.json())).toMatchObject({
        username: name("eski.anonim"),
        nickname: "Anonim Gezgin",
        email: mail(name("eski.anonim")),
      });

      const signedIn = SessionResponseSchema.parse((await login(name("eski.anonim"), "artik-hesabim-var")).json());
      const mine = await app.inject({ method: "GET", url: "/me/contributions", headers: auth(signedIn.token) });
      expect(mine.json().items).toHaveLength(1);

      const again = await upgrade({ username: name("ikinci.ad"), password: "artik-hesabim-var", email: mail(name("ikinci.ad")) });
      expect([again.statusCode, again.json().error.code]).toEqual([409, "ALREADY_REGISTERED"]);
    });

    it("does not let a banned account sign in", async () => {
      const session = await register({ username: name("yasakli"), password: "yasakli-parola" });
      if (!("user" in session)) throw new Error("expected a session");
      await prisma.app_user.update({ where: { id: session.user.id }, data: { banned_at: new Date() } });
      const response = await login(name("yasakli"), "yasakli-parola");
      expect([response.statusCode, response.json().error.code]).toEqual([403, "USER_BANNED"]);
    });

    it("gives an admin the moderator routes", async () => {
      const { token } = await createUser("admin", "test-admin");
      expect((await app.inject({ method: "GET", url: "/admin/contributions", headers: auth(token) })).statusCode).toBe(200);
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

    it("leaves a moderator's own contribution to another moderator", async () => {
      const author = await createUser("moderator", "test-moderator-yazar");
      const id = (await contribute(author.token, { kind: "tip", body: "Avlu kapısı sabah 9'da açılıyor." })).json().id;
      const own = await app.inject({ method: "POST", url: `/admin/contributions/${id}/approve`, headers: auth(author.token) });
      expect([own.statusCode, own.json().error.code]).toEqual([403, "OWN_CONTRIBUTION"]);
      expect((await app.inject({ method: "POST", url: `/admin/contributions/${id}/approve`, headers: auth(moderator) })).statusCode).toBe(200);
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
