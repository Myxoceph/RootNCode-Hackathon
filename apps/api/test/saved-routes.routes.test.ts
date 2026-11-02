/**
 * Integration tests: real PostgreSQL (DATABASE_URL). Users and their routes created here are
 * deleted afterwards (cascade from app_user).
 */
import "dotenv/config";
import { SAVED_ROUTES_KEPT, SavedRouteSchema, SavedRoutesResponseSchema, TripPlanResponseSchema } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("saved routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  const userIds: string[] = [];

  async function createUser() {
    const token = newToken();
    const user = await prisma.app_user.create({ data: { nickname: "rotalar", sessions: { create: { token_hash: hashToken(token) } } } });
    userIds.push(user.id);
    return { id: user.id, token };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const list = async (token: string) =>
    SavedRoutesResponseSchema.parse((await app.inject({ method: "GET", url: "/me/routes", headers: auth(token) })).json()).items;
  const save = (token: string, payload: object) => app.inject({ method: "POST", url: "/me/routes", headers: auth(token), payload });
  const planner = (id: string, dishes: string[] = []) => ({
    key: ["bursa", "half", dishes.join("+")].join("|"),
    route: { kind: "planner", id, region: "bursa", duration: "half", dishes, title: "Bursa yarım gün", stops: 5 },
  });

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false });
  });

  afterAll(async () => {
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("keeps routes on the account, last saved first, and only for their owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const first = await save(owner.token, planner("r1"));
    expect(first.statusCode, first.body).toBe(200);
    expect(SavedRouteSchema.parse(first.json())).toMatchObject({ kind: "planner", id: "r1", savedAt: expect.any(String) });

    const trip = TripPlanResponseSchema.parse((await app.inject({ method: "GET", url: "/routes/trip?city=bursa&duration=half" })).json());
    const tripSaved = await save(owner.token, { key: "trip|bursa|half", route: { kind: "trip", id: "t1", title: "Bursa gezi planı", stops: 4, trip } });
    expect(tripSaved.statusCode, tripSaved.body).toBe(200);

    expect((await list(owner.token)).map((route) => route.id)).toEqual(["t1", "r1"]);
    expect(await list(other.token)).toEqual([]);
    expect((await app.inject({ method: "DELETE", url: "/me/routes/r1", headers: auth(other.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/me/routes" })).statusCode).toBe(401);
  });

  it("keeps Rehber's food suggestions and transport directions", async () => {
    const user = await createUser();
    const place = { name: "Mevlana Müzesi", lat: 37.87, lng: 32.5, stopCode: null };
    const at = "2026-11-07T10:15:00+03:00";
    const transit = {
      version: "0.3.22",
      lang: "tr",
      city: "konya",
      from: { ...place, name: "Konya Garı" },
      to: { ...place, assetId: null },
      searchedFrom: at,
      itineraries: [],
      source: { name: "Konya Büyükşehir Belediyesi", license: "açık veri", timetable: "2026-11-01", url: "https://example.org/gtfs" },
    };
    const food = await save(user.token, {
      key: "food|etli-ekmek",
      route: { kind: "food", id: "f1", title: "Etli ekmek", question: "Ne yenir?", answer: "Etli ekmek denenmeli.", dishes: [{ id: "etli-ekmek", title: "Etli ekmek" }] },
    });
    expect(food.statusCode, food.body).toBe(200);
    const bus = await save(user.token, {
      key: "transit|konya-gari|mevlana",
      route: { kind: "transit", id: "b1", title: "Konya Garı → Mevlana Müzesi", question: "Nasıl giderim?", answer: "Otobüsle gidilir.", transit },
    });
    expect(bus.statusCode, bus.body).toBe(200);
    expect((await list(user.token)).map((route) => route.kind)).toEqual(["transit", "food"]);
  });

  it("replaces the same plan saved again, and deletes", async () => {
    const user = await createUser();
    await save(user.token, planner("a1", ["pideli-kofte"]));
    await save(user.token, planner("a2"));
    // The same plan from another device, with another id: one route.
    await save(user.token, planner("a3", ["pideli-kofte"]));
    expect((await list(user.token)).map((route) => route.id)).toEqual(["a3", "a2"]);

    expect((await app.inject({ method: "DELETE", url: "/me/routes/a2", headers: auth(user.token) })).statusCode).toBe(204);
    expect((await list(user.token)).map((route) => route.id)).toEqual(["a3"]);
    expect((await app.inject({ method: "DELETE", url: "/me/routes/a2", headers: auth(user.token) })).statusCode).toBe(404);
  });

  it(`rejects a malformed route and keeps the last ${SAVED_ROUTES_KEPT}`, async () => {
    const user = await createUser();
    expect((await save(user.token, { key: "x", route: { kind: "planner", id: "BAD ID", title: "x", stops: 1 } })).json().error.code).toBe("INVALID_BODY");

    const start = Date.now() - 60 * 60_000;
    await prisma.user_route.createMany({
      data: Array.from({ length: SAVED_ROUTES_KEPT }, (_, i) => ({
        user_id: user.id,
        id: `old-${i}`,
        key: `old|${i}`,
        kind: "planner",
        route: { ...planner(`old-${i}`).route },
        saved_at: new Date(start + i * 1000),
      })),
    });
    await save(user.token, planner("newest"));
    const ids = (await list(user.token)).map((route) => route.id);
    expect(ids).toHaveLength(SAVED_ROUTES_KEPT);
    expect(ids[0]).toBe("newest");
    expect(ids).not.toContain("old-0");
  });
});
