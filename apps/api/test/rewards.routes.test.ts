/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset, the seeded achievements
 * and the sample rewards. Users, visits, rewards and codes created here are deleted afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  AddRewardCodesResponseSchema,
  AdminRewardSchema,
  RedeemResponseSchema,
  RewardsResponseSchema,
  VisitResponseSchema,
  WalletResponseSchema,
} from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("visit proof, wallet and rewards (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  const userIds: string[] = [];
  const tag = randomUUID().slice(0, 6);
  const reward = `test-${tag}-kupa`;
  let asset: { id: string; lat: number; lng: number; mediaKey: string };
  let otherMediaKey: string;

  /** An account by default; only accounts may redeem. */
  async function createUser(role: "visitor" | "admin" = "visitor", { anonymous = false } = {}) {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: {
        nickname: `ödül-${role}`,
        role,
        // The tests sign in with the token; no password is ever checked.
        ...(!anonymous && { username: `odul_${tag}_${userIds.length}`, password_hash: "scrypt$test-no-login" }),
        sessions: { create: { token_hash: hashToken(token) } },
      },
    });
    userIds.push(user.id);
    return { id: user.id, token };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const call = (method: "GET" | "POST" | "PATCH", url: string, token?: string, payload?: object) =>
    app.inject({ method, url, ...(token && { headers: auth(token) }), ...(payload && { payload }) });
  /** Gives the user points as if earned: one achievement worth `points`. */
  async function grantPoints(userId: string, points: number) {
    const code = `test-${tag}-${randomUUID().slice(0, 6)}`;
    await prisma.achievement.create({
      data: { code, title_tr: "Test", description_tr: "Test", badge: "⭐", points, rule: { kind: "cities", count: 99 }, active: false, created_by: "test" },
    });
    await prisma.user_achievement.create({ data: { user_id: userId, achievement_code: code } });
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false });
    // An asset with an exact point and at least one photo.
    const [row] = await prisma.$queryRaw<{ id: string; lat: number; lng: number; media_key: string }[]>`
      SELECT a.id, a.lat, a.lng, am.media_key FROM asset a JOIN asset_media am ON am.asset_id = a.id
      WHERE a.status = 'published' AND a.lat IS NOT NULL AND a.coord_source IS DISTINCT FROM 'osm_area'
      ORDER BY a.id LIMIT 1`;
    asset = { id: row!.id, lat: row!.lat, lng: row!.lng, mediaKey: row!.media_key };
    // Media keys are numbered per asset (m01, m02…); this one is not a photo of the test asset.
    otherMediaKey = "m99-not-here";
    const admin = await createUser("admin");
    await call("POST", "/admin/rewards", admin.token, {
      code: reward,
      title: { tr: "Test Kupası" },
      description: { tr: "Test" },
      partner: "Test Kurumu",
      kind: "merch",
      costPoints: 50,
      minProvenVisits: 1,
    });
  });

  afterAll(async () => {
    await prisma.reward.deleteMany({ where: { code: { startsWith: `test-${tag}` } } });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.achievement.deleteMany({ where: { code: { startsWith: `test-${tag}` } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("proves a visit only with one of the asset's own photos, and earns İlk Mühür", async () => {
    const { token } = await createUser();
    const near = { lat: asset.lat, lng: asset.lng };
    const wrong = await call("POST", `/assets/${asset.id}/visit/proof`, token, { ...near, mediaKey: otherMediaKey, method: "device_recognition" });
    expect([wrong.statusCode, wrong.json().error.code]).toEqual([400, "UNKNOWN_MEDIA"]);

    const proof = VisitResponseSchema.parse(
      (await call("POST", `/assets/${asset.id}/visit/proof`, token, { ...near, mediaKey: asset.mediaKey, method: "device_recognition" })).json(),
    );
    expect(proof).toMatchObject({ proven: true, verified: true, firstVisit: true });
    expect(proof.newAchievements.map((a) => a.code)).toContain("zaman-yolcusu");
    const wallet = WalletResponseSchema.parse((await call("GET", "/me/wallet", token)).json());
    expect(wallet.provenVisits).toBe(1);
    expect(wallet.earned).toBeGreaterThanOrEqual(40);
  });

  it("lists rewards with their stock, and redeems one code for points", async () => {
    const admin = await createUser("admin");
    const added = AddRewardCodesResponseSchema.parse(
      (await call("POST", `/admin/rewards/${reward}/codes`, admin.token, { codes: ["KOD-1111", "KOD-2222", "KOD-1111"] })).json(),
    );
    expect(added).toMatchObject({ added: 2, duplicates: 1, stock: 2 });
    const list = RewardsResponseSchema.parse((await call("GET", "/rewards")).json());
    expect(list.items.find((r) => r.code === reward)).toMatchObject({ stock: 2, costPoints: 50, minProvenVisits: 1 });
    expect(list.items.find((r) => r.code === "vakif-kupa")).toMatchObject({ sample: true, stock: 20 });

    const visitor = await createUser();
    const noProof = await call("POST", `/rewards/${reward}/redeem`, visitor.token);
    expect([noProof.statusCode, noProof.json().error.code]).toEqual([409, "PROVEN_VISITS_REQUIRED"]);

    await call("POST", `/assets/${asset.id}/visit/proof`, visitor.token, { lat: asset.lat, lng: asset.lng, mediaKey: asset.mediaKey, method: "device_recognition" });
    await prisma.user_achievement.deleteMany({ where: { user_id: visitor.id } });
    // The sealed visit alone earns 20 activity points (visit + seal), short of the 50-point reward.
    const poor = await call("POST", `/rewards/${reward}/redeem`, visitor.token);
    expect([poor.statusCode, poor.json().error.code]).toEqual([409, "INSUFFICIENT_POINTS"]);

    await grantPoints(visitor.id, 120);
    const got = RedeemResponseSchema.parse((await call("POST", `/rewards/${reward}/redeem`, visitor.token)).json());
    expect(got.redemption).toMatchObject({ points: 50, reward: { code: reward, partner: "Test Kurumu" } });
    expect(["KOD-1111", "KOD-2222"]).toContain(got.redemption.code);
    expect(got.balance).toBe(90);
    const wallet = WalletResponseSchema.parse((await call("GET", "/me/wallet", visitor.token)).json());
    expect(wallet).toMatchObject({ earned: 140, spent: 50, balance: 90 });
    expect(wallet.redemptions.map((r) => r.code)).toEqual([got.redemption.code]);
  });

  it("asks an anonymous visitor to sign up before redeeming", async () => {
    const visitor = await createUser("visitor", { anonymous: true });
    await grantPoints(visitor.id, 500);
    const res = await call("POST", `/rewards/${reward}/redeem`, visitor.token);
    expect([res.statusCode, res.json().error.code]).toEqual([403, "ACCOUNT_REQUIRED"]);
  });

  it("never spends one balance twice or gives one code twice when requests race", async () => {
    const visitor = await createUser();
    await prisma.visit.create({ data: { user_id: visitor.id, asset_id: asset.id, verified: true, proven_at: new Date(), proof_method: "device_recognition" } });
    await grantPoints(visitor.id, 60); // with the sealed visit's 20, enough for one 50-point reward, not two
    const admin = await createUser("admin");
    await call("POST", `/admin/rewards/${reward}/codes`, admin.token, { codes: ["KOD-3333", "KOD-4444"] });

    const results = await Promise.all([1, 2, 3].map(() => call("POST", `/rewards/${reward}/redeem`, visitor.token)));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);
    const wallet = WalletResponseSchema.parse((await call("GET", "/me/wallet", visitor.token)).json());
    expect(wallet).toMatchObject({ spent: 50, balance: 30 });
  });

  it("lets only admins manage rewards, and reports out of stock", async () => {
    const visitor = await createUser();
    expect((await call("POST", "/admin/rewards", visitor.token, {})).statusCode).toBe(403);
    const admin = await createUser("admin");
    const empty = `test-${tag}-bos`;
    const made = await call("POST", "/admin/rewards", admin.token, {
      code: empty, title: { tr: "Boş", en: "Empty" }, description: { tr: "Kodu yok" }, partner: "Test", kind: "discount", costPoints: 1,
    });
    expect(AdminRewardSchema.parse(made.json())).toMatchObject({ codesTotal: 0, stock: 0, minProvenVisits: 0, active: true, titleEn: "Empty", descriptionEn: null });
    // Turkish alone keeps the English.
    const renamed = await call("PATCH", `/admin/rewards/${empty}`, admin.token, { title: { tr: "Boş ödül" } });
    expect(AdminRewardSchema.parse(renamed.json())).toMatchObject({ title: "Boş ödül", titleEn: "Empty" });
    // Made without a drawing, it has none (the app picks one); one is picked, then taken away again.
    expect(AdminRewardSchema.parse(made.json()).art).toBeNull();
    const drawn = await call("PATCH", `/admin/rewards/${empty}`, admin.token, { art: "lantern" });
    expect(AdminRewardSchema.parse(drawn.json()).art).toBe("lantern");
    expect((await call("PATCH", `/admin/rewards/${empty}`, admin.token, { art: "rocket" })).statusCode).toBe(400);
    const plain = await call("PATCH", `/admin/rewards/${empty}`, admin.token, { art: null });
    expect(AdminRewardSchema.parse(plain.json()).art).toBeNull();
    await grantPoints(visitor.id, 5);
    const out = await call("POST", `/rewards/${empty}/redeem`, visitor.token);
    expect([out.statusCode, out.json().error.code]).toEqual([409, "OUT_OF_STOCK"]);
    const off = await call("PATCH", `/admin/rewards/${empty}`, admin.token, { active: false });
    expect(AdminRewardSchema.parse(off.json()).active).toBe(false);
    expect((await call("POST", `/rewards/${empty}/redeem`, visitor.token)).statusCode).toBe(404);
  });
});
