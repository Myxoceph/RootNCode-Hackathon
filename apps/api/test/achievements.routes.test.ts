/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset imported and the
 * seeded achievements. Users, visits and achievements created here are deleted afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  ACTIVITY_POINTS,
  AchievementsResponseSchema,
  AdminAchievementSchema,
  AdminAchievementsResponseSchema,
  MyAchievementsResponseSchema,
  MyConnectionsResponseSchema,
  MyVisitsResponseSchema,
  VisitResponseSchema,
} from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("achievements (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  const userIds: string[] = [];
  const tag = randomUUID().slice(0, 6);
  let located: { id: string; lat: number; lng: number };
  let unlocated: { id: string; city_code: string };

  async function createUser(role: "visitor" | "admin" = "visitor") {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: { nickname: `başarım-${role}`, role, sessions: { create: { token_hash: hashToken(token) } } },
    });
    userIds.push(user.id);
    return token;
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const visit = (token: string, id: string, payload: object = {}) =>
    app.inject({ method: "POST", url: `/assets/${id}/visit`, headers: auth(token), payload });

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false });
    // An exact point: approximate ones (osm_area) are not position-checked.
    const withPoint = await prisma.asset.findFirstOrThrow({
      where: { status: "published", city_code: "bursa", lat: { not: null }, NOT: { coord_source: "osm_area" } },
    });
    located = { id: withPoint.id, lat: withPoint.lat!, lng: withPoint.lng! };
    unlocated = await prisma.asset.findFirstOrThrow({
      where: { status: "published", lat: null, city_code: { not: "bursa" } },
      select: { id: true, city_code: true },
    });
  });

  afterAll(async () => {
    await prisma.achievement.deleteMany({ where: { code: { startsWith: `test-${tag}` } } });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("lists the seeded achievements", async () => {
    const body = AchievementsResponseSchema.parse((await app.inject({ method: "GET", url: "/achievements" })).json());
    expect(body.items.length).toBeGreaterThanOrEqual(30);
    expect(body.items.find((a) => a.code === "uc-sehir")).toMatchObject({ points: 100, rule: { kind: "cities", count: 3 } });
  });

  it("checks the position for an asset with a point and earns the city's first-step badge once", async () => {
    const token = await createUser();
    const far = await visit(token, located.id, { lat: located.lat + 0.01, lng: located.lng });
    expect([far.statusCode, far.json().error.code]).toEqual([400, "TOO_FAR"]);
    const none = await visit(token, located.id);
    expect([none.statusCode, none.json().error.code]).toEqual([400, "POSITION_REQUIRED"]);

    const near = VisitResponseSchema.parse((await visit(token, located.id, { lat: located.lat + 0.0005, lng: located.lng })).json());
    expect(near).toMatchObject({ verified: true, firstVisit: true });
    expect(near.distanceMeters).toBeLessThan(200);
    expect(near.newAchievements.map((a) => a.code)).toContain("bursa-ilk-adim");

    const again = VisitResponseSchema.parse((await visit(token, located.id, { lat: located.lat, lng: located.lng })).json());
    expect(again).toMatchObject({ firstVisit: false, newAchievements: [] });
  });

  it("takes an asset without a point unchecked, and reports progress and points", async () => {
    const token = await createUser();
    const res = VisitResponseSchema.parse((await visit(token, unlocated.id)).json());
    expect(res).toMatchObject({ verified: false, distanceMeters: null, firstVisit: true });
    expect(res.newAchievements.map((a) => a.code)).toContain(`${unlocated.city_code}-ilk-adim`);

    const mine = MyAchievementsResponseSchema.parse((await app.inject({ method: "GET", url: "/me/achievements", headers: auth(token) })).json());
    expect(mine.visits).toBe(1);
    // The first-step badge's 10 and the visit's own 10.
    expect(mine).toMatchObject({ totalPoints: 20, activityPoints: ACTIVITY_POINTS.visit, sealed: 0 });
    expect(mine.items.find((a) => a.code === `${unlocated.city_code}-ilk-adim`)?.earnedAt).not.toBeNull();
    expect(mine.items.find((a) => a.code === "uc-sehir")).toMatchObject({ earnedAt: null, progress: { current: 1, target: 3 } });
  });

  it("unlocks an asset without position or photo only when the demo unlock is on", async () => {
    const token = await createUser();
    const unlock = (on: ReturnType<typeof buildApp>) => on.inject({ method: "POST", url: `/assets/${located.id}/visit/unlock`, headers: auth(token) });
    expect((await unlock(app)).statusCode).toBe(404);

    const demo = buildApp({ prisma, rateLimit: false, demoUnlock: true });
    try {
      const first = VisitResponseSchema.parse((await unlock(demo)).json());
      expect(first).toMatchObject({ verified: false, distanceMeters: null, firstVisit: true });
      expect(first.newAchievements.map((a) => a.code)).toContain("bursa-ilk-adim");
      expect(VisitResponseSchema.parse((await unlock(demo)).json())).toMatchObject({ firstVisit: false, newAchievements: [] });
      expect((await demo.inject({ method: "POST", url: "/assets/yok-boyle-bir-eser/visit/unlock", headers: auth(token) })).statusCode).toBe(404);
      expect((await demo.inject({ method: "POST", url: `/assets/${located.id}/visit/unlock` })).statusCode).toBe(401);

      const mine = MyAchievementsResponseSchema.parse((await app.inject({ method: "GET", url: "/me/achievements", headers: auth(token) })).json());
      expect(mine).toMatchObject({ visits: 1, sealed: 0, activityPoints: ACTIVITY_POINTS.visit });
    } finally {
      await demo.close();
    }
  });

  it("counts notes waiting and approved, and only approved ones earn points and badges", async () => {
    const token = await createUser();
    const session = await prisma.user_session.findUniqueOrThrow({ where: { token_hash: hashToken(token) } });
    const moderator = await prisma.user_session.findUniqueOrThrow({ where: { token_hash: hashToken(await createUser("admin")) } });
    // A reviewed note names its reviewer (a check in the database).
    const reviewed = { reviewed_by: moderator.user_id, reviewed_at: new Date() };
    const note = (status: string) => ({
      user_id: session.user_id,
      asset_id: unlocated.id,
      kind: "tip",
      body: "Avlu sabah sakin.",
      status,
      ...(status !== "pending" && reviewed),
    });
    await prisma.contribution.createMany({ data: [note("approved"), note("approved"), note("pending"), note("rejected")] });

    const mine = MyAchievementsResponseSchema.parse((await app.inject({ method: "GET", url: "/me/achievements", headers: auth(token) })).json());
    expect(mine.notes).toEqual({ approved: 2, pending: 1 });
    expect(mine.activityPoints).toBe(2 * ACTIVITY_POINTS.note);
    const first = mine.items.find((a) => a.code === "ilk-not")!;
    expect(first.earnedAt).not.toBeNull();
    expect(mine.items.find((a) => a.code === "on-not")).toMatchObject({ earnedAt: null, progress: { current: 2, target: 10 } });
    expect(mine.totalPoints).toBe(first.points + 2 * ACTIVITY_POINTS.note);
    await prisma.contribution.deleteMany({ where: { user_id: session.user_id } });
  });

  it("lists my visits newest first, with how each was checked", async () => {
    const token = await createUser();
    const mine = () => app.inject({ method: "GET", url: "/me/visits", headers: auth(token) });
    expect((await app.inject({ method: "GET", url: "/me/visits" })).statusCode).toBe(401);
    expect(MyVisitsResponseSchema.parse((await mine()).json()).items).toEqual([]);

    await visit(token, located.id, { lat: located.lat, lng: located.lng });
    await visit(token, unlocated.id);
    const body = MyVisitsResponseSchema.parse((await mine()).json());
    expect(body.items.map(({ assetId, verified, proven }) => ({ assetId, verified, proven }))).toEqual([
      { assetId: unlocated.id, verified: false, proven: false },
      { assetId: located.id, verified: true, proven: false },
    ]);
  });

  it("does not position-check an asset whose point is only its neighbourhood's centre", async () => {
    const token = await createUser();
    const before = await prisma.asset.findUniqueOrThrow({ where: { id: unlocated.id }, select: { lat: true, lng: true, coord_source: true } });
    await prisma.asset.update({ where: { id: unlocated.id }, data: { lat: 36.2, lng: 36.16, coord_source: "osm_area" } });
    try {
      const detail = await app.inject({ method: "GET", url: `/assets/${unlocated.id}` });
      expect(detail.json().coordinates).toMatchObject({ approximate: true, source: "osm_area" });
      const res = VisitResponseSchema.parse((await visit(token, unlocated.id)).json());
      expect(res).toMatchObject({ verified: false, distanceMeters: null });
    } finally {
      await prisma.asset.update({ where: { id: unlocated.id }, data: before });
    }
  });

  it("lets an admin add, change and remove achievements, with checked rules", async () => {
    const admin = await createUser("admin");
    const visitor = await createUser();
    const create = (payload: object) => app.inject({ method: "POST", url: "/admin/achievements", headers: auth(admin), payload });
    const code = `test-${tag}-iki-eser`;

    const bad = await create({ code: `${code}-x`, title: { tr: "Kötü" }, description: { tr: "Yok" }, badge: "⭐", points: 5, rule: { kind: "visit_count", count: 1, city: "atlantis" } });
    expect([bad.statusCode, bad.json().error.code]).toEqual([400, "UNKNOWN_CODE"]);
    const invalid = await create({ code: `${code}-y`, title: { tr: "Kötü" }, description: { tr: "Yok" }, badge: "⭐", points: 5, rule: { kind: "teleport" } });
    expect(invalid.statusCode).toBe(400);

    const made = await create({ code, title: { tr: "İki Eser" }, description: { tr: "İki eser ziyaret et." }, badge: "⭐", points: 7, rule: { kind: "visit_count", count: 2 } });
    expect(made.statusCode, made.body).toBe(201);
    expect(AdminAchievementSchema.parse(made.json())).toMatchObject({ createdBy: "başarım-admin", earnedCount: 0, active: true });
    expect((await create({ code, title: { tr: "Tekrar" }, description: { tr: "x" }, badge: "⭐", points: 1, rule: { kind: "cities", count: 1 } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/admin/achievements", headers: auth(visitor), payload: {} })).statusCode).toBe(403);

    const off = await app.inject({ method: "PATCH", url: `/admin/achievements/${code}`, headers: auth(admin), payload: { active: false } });
    expect(AdminAchievementSchema.parse(off.json()).active).toBe(false);
    const list = AchievementsResponseSchema.parse((await app.inject({ method: "GET", url: "/achievements" })).json());
    expect(list.items.some((a) => a.code === code)).toBe(false);
    const all = AdminAchievementsResponseSchema.parse((await app.inject({ method: "GET", url: "/admin/achievements", headers: auth(admin) })).json());
    expect(all.items.some((a) => a.code === code)).toBe(true);

    expect((await app.inject({ method: "DELETE", url: `/admin/achievements/${code}`, headers: auth(admin) })).statusCode).toBe(204);
    expect((await app.inject({ method: "DELETE", url: `/admin/achievements/${code}`, headers: auth(admin) })).statusCode).toBe(404);
  });

  it("keeps a bond a mystery until both of its assets are discovered", async () => {
    const ULUCAMI = "bursa-osmangazi-ulucami";
    const YESIL = "bursa-yildirim-yesil-camii";
    const token = await createUser();
    const userId = (await prisma.user_session.findUniqueOrThrow({ where: { token_hash: hashToken(token) } })).user_id;
    const connections = async () =>
      MyConnectionsResponseSchema.parse((await app.inject({ method: "GET", url: "/me/connections", headers: auth(token) })).json()).items;

    expect(await connections()).toEqual([]);

    await prisma.visit.create({ data: { user_id: userId, asset_id: ULUCAMI, verified: false } });
    const mystery = await connections();
    expect(mystery.every((item) => item.from === ULUCAMI)).toBe(true);
    // Same architect as Yeşil Camii: where it is, not what binds them.
    expect(mystery.find((item) => item.to === YESIL)).toEqual({ revealed: false, from: ULUCAMI, to: YESIL, toCoordinates: expect.any(Object) });
    // Only bonds that tell a story, only to published assets on the map, one glow per asset.
    const bonds = await prisma.asset_relation.findMany({ where: { OR: [{ source_asset_id: ULUCAMI }, { target_asset_id: ULUCAMI }] } });
    const untold = new Set(bonds.filter((b) => ["same_complex", "urban_context"].includes(b.type_code)).map((b) => (b.source_asset_id === ULUCAMI ? b.target_asset_id : b.source_asset_id)));
    const told = new Set(bonds.filter((b) => !["same_complex", "urban_context"].includes(b.type_code)).map((b) => (b.source_asset_id === ULUCAMI ? b.target_asset_id : b.source_asset_id)));
    for (const item of mystery) expect(told.has(item.to) || !untold.has(item.to)).toBe(true);
    expect(mystery.map((item) => item.to)).not.toContain("manisa-ulucami");
    expect(new Set(mystery.map((item) => item.to)).size).toBe(mystery.length);

    await prisma.visit.create({ data: { user_id: userId, asset_id: YESIL, verified: false } });
    const revealed = (await connections()).filter((item) => item.revealed);
    expect(revealed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: ULUCAMI, to: YESIL, direction: "outgoing", type: { code: "same_architect", label: expect.any(String) }, toName: "Yeşil Camii" }),
        expect.objectContaining({ from: YESIL, to: ULUCAMI, direction: "incoming", type: expect.objectContaining({ code: "same_architect" }) }),
      ]),
    );
    expect((await app.inject({ method: "GET", url: "/me/connections" })).statusCode).toBe(401);
  });
});
