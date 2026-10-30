/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset imported and the
 * seeded achievements. Users, visits and achievements created here are deleted afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  AchievementsResponseSchema,
  AdminAchievementSchema,
  AdminAchievementsResponseSchema,
  MyAchievementsResponseSchema,
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
    const withPoint = await prisma.asset.findFirstOrThrow({ where: { status: "published", city_code: "bursa", lat: { not: null } } });
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
    expect(mine.totalPoints).toBe(10);
    expect(mine.items.find((a) => a.code === `${unlocated.city_code}-ilk-adim`)?.earnedAt).not.toBeNull();
    expect(mine.items.find((a) => a.code === "uc-sehir")).toMatchObject({ earnedAt: null, progress: { current: 1, target: 3 } });
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
});
