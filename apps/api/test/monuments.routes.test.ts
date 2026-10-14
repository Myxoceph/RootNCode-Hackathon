/**
 * Integration tests: real PostgreSQL (DATABASE_URL), real routes, real mapper.
 * The database is brought to a known state with the same seed as development,
 * and the API responses are compared with the mock the mobile team builds against.
 */
import "dotenv/config";
import {
  CONTRACT_VERSION,
  MonumentSchema,
  MonumentsPayloadSchema,
  type Monument,
} from "@vagabonds/contracts";
import mock from "@vagabonds/contracts/mock/mock_monuments.json" with { type: "json" };
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { seedDatabase } from "../src/db/seed.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const fixture = MonumentsPayloadSchema.parse(mock);

/** Order-independent view of a monument; timestamps compared as instants. */
function normalize(monument: Monument): Monument {
  return {
    ...monument,
    inscriptions: [...monument.inscriptions].sort((a, b) => a.id.localeCompare(b.id)),
    relations: [...monument.relations].sort(
      (a, b) =>
        a.relationType.localeCompare(b.relationType) ||
        a.direction.localeCompare(b.direction) ||
        a.relatedMonumentSlug.localeCompare(b.relatedMonumentSlug),
    ),
    visitorTips: monument.visitorTips
      .map((tip) => ({ ...tip, createdAt: new Date(tip.createdAt).toISOString() }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function fixtureMonument(slug: string): Monument {
  const monument = fixture.monuments.find((m) => m.slug === slug);
  if (!monument) throw new Error(`fixture has no monument "${slug}"`);
  return monument;
}

describe.skipIf(!DATABASE_URL)("monuments routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL!);
    await seedDatabase(prisma, fixture);
    app = buildApp({ prisma });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  describe("GET /monuments", () => {
    it("returns a contract-valid payload that matches the mock", async () => {
      const response = await app.inject({ method: "GET", url: "/monuments" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("public, max-age=60");

      const payload = MonumentsPayloadSchema.parse(response.json());
      expect(payload.version).toBe(CONTRACT_VERSION);

      for (const expected of fixture.monuments) {
        const actual = payload.monuments.find((m) => m.slug === expected.slug);
        expect(actual, expected.slug).toBeDefined();
        expect(normalize(actual!)).toEqual(normalize(expected));
      }
      expect(payload.cityCuisines).toEqual(expect.arrayContaining(fixture.cityCuisines));
    });

    it("filters monuments and cuisines by city", async () => {
      const response = await app.inject({ method: "GET", url: `/monuments?city=${encodeURIComponent("Edirne")}` });

      const payload = MonumentsPayloadSchema.parse(response.json());
      expect(payload.monuments.map((m) => m.slug)).toEqual(
        expect.arrayContaining(["selimiye-camii", "selimiye-arastasi"]),
      );
      expect(payload.monuments.every((m) => m.city === "Edirne")).toBe(true);
      expect(payload.cityCuisines.every((c) => c.city === "Edirne")).toBe(true);
    });

    it("rejects cities outside the contract", async () => {
      const response = await app.inject({ method: "GET", url: "/monuments?city=Istanbul" });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_QUERY");
    });
  });

  describe("GET /monuments/:slug", () => {
    it("returns a single monument that matches the mock", async () => {
      const response = await app.inject({ method: "GET", url: "/monuments/selimiye-camii" });

      expect(response.statusCode).toBe(200);
      const monument = MonumentSchema.parse(response.json());
      expect(normalize(monument)).toEqual(normalize(fixtureMonument("selimiye-camii")));
    });

    it("returns 404 for an unknown monument", async () => {
      const response = await app.inject({ method: "GET", url: "/monuments/olmayan-eser" });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: "MONUMENT_NOT_FOUND", message: 'Monument "olmayan-eser" not found' },
      });
    });

    it("returns 400 for a malformed slug", async () => {
      const response = await app.inject({ method: "GET", url: "/monuments/Not_A_Slug" });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_SLUG");
    });

    it("never exposes visitor tips that are not approved", async () => {
      const pendingTipId = "d0d0d0d0-0000-4000-8000-000000000001";
      const selimiye = fixtureMonument("selimiye-camii");
      await prisma.visitorTip.create({
        data: { id: pendingTipId, monumentId: selimiye.id, tipText: "Moderasyon bekliyor", status: "PENDING" },
      });

      try {
        const response = await app.inject({ method: "GET", url: "/monuments/selimiye-camii" });
        const ids = MonumentSchema.parse(response.json()).visitorTips.map((t) => t.id);
        expect(ids).not.toContain(pendingTipId);
      } finally {
        await prisma.visitorTip.delete({ where: { id: pendingTipId } });
      }
    });
  });
});
