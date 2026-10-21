/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset imported by
 * data/tools/import_to_db.py (CI runs the import before the tests), real routes,
 * real mapper. Every response is also parsed with the shared contract.
 */
import "dotenv/config";
import {
  AssetDetailSchema,
  AssetListResponseSchema,
  AssetRelationsResponseSchema,
  NearbyAssetsResponseSchema,
} from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const ULUCAMI = "bursa-osmangazi-ulucami";
const MEDIA_BASE_URL = "https://media.test";

describe.skipIf(!DATABASE_URL)("assets routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  let publishedCount: number;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, mediaBaseUrl: MEDIA_BASE_URL });
    publishedCount = await prisma.asset.count({ where: { status: "published" } });
    if (publishedCount === 0) throw new Error("no published assets: run `npm run db:import` first");
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function list(query: string) {
    const response = await app.inject({ method: "GET", url: `/assets${query}` });
    expect(response.statusCode).toBe(200);
    return AssetListResponseSchema.parse(response.json());
  }

  describe("GET /assets", () => {
    it("lists published assets with paging and the contract version", async () => {
      const body = await list("?limit=5&offset=0");

      expect(body.total).toBe(publishedCount);
      expect(body.items).toHaveLength(5);
      expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);

      const next = await list("?limit=5&offset=5");
      const ids = new Set([...body.items, ...next.items].map((item) => item.id));
      expect(ids.size).toBe(10);
    });

    it("filters by type and city", async () => {
      const body = await list("?city=bursa&type=hamam&limit=500");

      expect(body.total).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.type.code).toBe("hamam");
        expect(item.city.code).toBe("bursa");
      }
    });

    it("finds names with and without Turkish characters", async () => {
      const withAccents = await list(`?q=${encodeURIComponent("ÖRDEKLİ")}`);
      const ascii = await list("?q=ordekli%20hamam");

      expect(withAccents.items.map((item) => item.id)).toContain("bursa-osmangazi-ordekli-hamam");
      expect(ascii.items.map((item) => item.id)).toContain("bursa-osmangazi-ordekli-hamam");
    });

    it("returns only assets with coordinates inside the bbox", async () => {
      const body = await list("?bbox=29.0,40.1,29.1,40.3&limit=500");

      expect(body.items.map((item) => item.id)).toContain(ULUCAMI);
      for (const item of body.items) {
        expect(item.coordinates).not.toBeNull();
        expect(item.coordinates?.lng).toBeGreaterThanOrEqual(29.0);
        expect(item.coordinates?.lat).toBeLessThanOrEqual(40.3);
      }
    });

    it("serves assets without coordinates or photos with nulls", async () => {
      const bare = await prisma.asset.findFirst({
        where: { status: "published", lat: null, asset_media: { is: null } },
        select: { id: true, name_tr: true },
      });
      if (!bare) return; // every asset has a location and photo: nothing to check

      const body = await list(`?q=${encodeURIComponent(bare.name_tr)}&limit=500`);
      const item = body.items.find((candidate) => candidate.id === bare.id);
      expect(item?.coordinates).toBeNull();
      expect(item?.cover).toBeNull();
    });

    it("rejects malformed queries", async () => {
      for (const query of ["?limit=0", "?limit=501", "?bbox=1,2", "?lang=de", "?city=Bursa"]) {
        const response = await app.inject({ method: "GET", url: `/assets${query}` });
        expect(response.statusCode, query).toBe(400);
        expect(response.json().error.code).toBe("INVALID_QUERY");
      }
    });
  });

  describe("GET /assets/:id", () => {
    it("returns the detail with confidence, sources and responsive images", async () => {
      const response = await app.inject({ method: "GET", url: `/assets/${ULUCAMI}` });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-language"]).toBe("tr");
      const asset = AssetDetailSchema.parse(response.json());

      expect(asset.sections.length).toBeGreaterThan(0);
      for (const section of asset.sections) {
        expect(section.confidence.label.length).toBeGreaterThan(0);
        expect(section.sources.length).toBeGreaterThan(0);
      }
      expect(asset.legends.length).toBeGreaterThan(0);
      expect(asset.sources.map((source) => source.sourceId)).toContain("vk-bursa-c1");
      expect(asset.cover?.sources.webp[0]?.url.startsWith(`${MEDIA_BASE_URL}/assets/${ULUCAMI}/`)).toBe(true);
    });

    it("never exposes where a photo was taken", async () => {
      const withGps = await prisma.media.count({
        where: { capture_lat: { not: null }, asset_media: { some: { asset_id: ULUCAMI } } },
      });
      const response = await app.inject({ method: "GET", url: `/assets/${ULUCAMI}` });

      expect(withGps).toBeGreaterThan(0); // the test is meaningful only if GPS exists in the DB
      expect(response.body).not.toMatch(/capture|captured/i);
    });

    it("answers in English via ?lang= or Accept-Language", async () => {
      const viaQuery = await app.inject({ method: "GET", url: `/assets/${ULUCAMI}?lang=en` });
      const viaHeader = await app.inject({
        method: "GET",
        url: `/assets/${ULUCAMI}`,
        headers: { "accept-language": "en-US,en;q=0.9" },
      });

      expect(viaQuery.headers["content-language"]).toBe("en");
      expect(viaHeader.headers["content-language"]).toBe("en");
      const asset = AssetDetailSchema.parse(viaQuery.json());
      expect(asset.type.label).toBe("Mosque");
      expect(asset.sections[0]?.confidence.label).not.toBe("Kaynakta kesin");
    });

    it("returns 404 for unknown ids and 400 for malformed ones", async () => {
      const missing = await app.inject({ method: "GET", url: "/assets/bursa-osmangazi-yok-boyle-bir-eser" });
      const malformed = await app.inject({ method: "GET", url: "/assets/Not_An_Id" });

      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe("ASSET_NOT_FOUND");
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().error.code).toBe("INVALID_ID");
    });
  });

  describe("GET /assets/:id/relations", () => {
    async function relationsOf(id: string) {
      const response = await app.inject({ method: "GET", url: `/assets/${id}/relations` });
      expect(response.statusCode).toBe(200);
      return AssetRelationsResponseSchema.parse(response.json());
    }

    it("returns links in both directions, each with confidence and sources", async () => {
      const body = await relationsOf(ULUCAMI);

      expect(body.assetId).toBe(ULUCAMI);
      expect(new Set(body.items.map((item) => item.direction))).toEqual(new Set(["outgoing", "incoming"]));
      for (const item of body.items) {
        expect(item.asset.id).not.toBe(ULUCAMI);
        expect(item.sources.length).toBeGreaterThan(0);
      }
    });

    it("shows a link recorded on both assets only once", async () => {
      const relations = await prisma.asset_relation.findMany({
        select: { source_asset_id: true, target_asset_id: true, type_code: true },
      });
      const keys = new Set(relations.map((r) => `${r.source_asset_id}>${r.target_asset_id}>${r.type_code}`));
      const mutual = relations.find((r) => keys.has(`${r.target_asset_id}>${r.source_asset_id}>${r.type_code}`));
      if (!mutual) return; // no link is recorded on both ends: nothing to check

      const body = await relationsOf(mutual.source_asset_id);
      const links = body.items.map((item) => `${item.asset.id}:${item.type.code}`);
      expect(new Set(links).size).toBe(links.length);
      const shown = body.items.filter(
        (item) => item.asset.id === mutual.target_asset_id && item.type.code === mutual.type_code,
      );
      expect(shown.map((item) => item.direction)).toEqual(["outgoing"]);
    });

    it("counts links to unpublished assets without returning them", async () => {
      const before = await relationsOf(ULUCAMI);
      const hidden = before.items[0]?.asset.id;
      if (!hidden) throw new Error(`${ULUCAMI} has no visible relations`);
      const original = await prisma.asset.findUniqueOrThrow({ where: { id: hidden }, select: { status: true } });
      try {
        await prisma.asset.update({ where: { id: hidden }, data: { status: "in_review" } });
        const after = await relationsOf(ULUCAMI);
        const removed = before.items.filter((item) => item.asset.id === hidden).length;

        expect(after.items.map((item) => item.asset.id)).not.toContain(hidden);
        expect(after.unavailableCount).toBe(before.unavailableCount + removed);
      } finally {
        await prisma.asset.update({ where: { id: hidden }, data: { status: original.status } });
      }
    });

    it("returns 404 for unknown assets", async () => {
      const response = await app.inject({ method: "GET", url: "/assets/bursa-osmangazi-yok-boyle-bir-eser/relations" });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("ASSET_NOT_FOUND");
    });
  });

  describe("GET /assets/:id/nearby", () => {
    async function nearby(path: string) {
      const response = await app.inject({ method: "GET", url: `/assets/${path}` });
      expect(response.statusCode).toBe(200);
      return NearbyAssetsResponseSchema.parse(response.json());
    }

    it("lists located assets within the radius, nearest first", async () => {
      const body = await nearby(`${ULUCAMI}/nearby?radius=50000`);

      expect(body.origin).not.toBeNull();
      expect(body.items.length).toBeGreaterThan(0);
      const distances = body.items.map((item) => item.distanceMeters);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      for (const item of body.items) {
        expect(item.asset.id).not.toBe(ULUCAMI);
        expect(item.asset.coordinates).not.toBeNull();
        expect(item.distanceMeters).toBeLessThanOrEqual(50_000);
      }
    });

    it("leaves out assets beyond the radius and honours the limit", async () => {
      const wide = await nearby(`${ULUCAMI}/nearby?radius=50000&limit=50`);
      // The smallest allowed radius is 100 m, so pick an asset far enough to fall outside a tighter circle.
      const far = wide.items.find((item) => item.distanceMeters >= 150);
      if (!far) throw new Error("no located asset 150 m or more from Ulucami");

      const radius = far.distanceMeters - 50;
      const tight = await nearby(`${ULUCAMI}/nearby?radius=${radius}&limit=50`);
      expect(tight.items.map((item) => item.asset.id)).not.toContain(far.asset.id);
      expect(tight.items.every((item) => item.distanceMeters <= radius)).toBe(true);
      expect((await nearby(`${ULUCAMI}/nearby?radius=50000&limit=1`)).items).toHaveLength(1);
    });

    it("returns an empty list for assets without coordinates", async () => {
      const bare = await prisma.asset.findFirst({ where: { status: "published", lat: null }, select: { id: true } });
      if (!bare) return; // every asset is located: nothing to check

      const body = await nearby(`${bare.id}/nearby`);
      expect(body.origin).toBeNull();
      expect(body.items).toEqual([]);
    });

    it("rejects out-of-range parameters and unknown assets", async () => {
      for (const query of ["radius=50", "radius=50001", "limit=0", "limit=51"]) {
        const response = await app.inject({ method: "GET", url: `/assets/${ULUCAMI}/nearby?${query}` });
        expect(response.statusCode, query).toBe(400);
      }
      const missing = await app.inject({ method: "GET", url: "/assets/bursa-osmangazi-yok-boyle-bir-eser/nearby" });
      expect(missing.statusCode).toBe(404);
    });
  });

  describe("visibility", () => {
    const TARGET = "bursa-osmangazi-ordekli-hamam";

    async function statusOf(appToUse: ReturnType<typeof buildApp>) {
      return (await appToUse.inject({ method: "GET", url: `/assets/${TARGET}` })).statusCode;
    }

    it("serves in_review only in preview and drafts never", async () => {
      const preview = buildApp({ prisma, mediaBaseUrl: MEDIA_BASE_URL, assetVisibility: "preview" });
      const original = await prisma.asset.findUniqueOrThrow({ where: { id: TARGET }, select: { status: true } });
      try {
        await prisma.asset.update({ where: { id: TARGET }, data: { status: "in_review" } });
        expect(await statusOf(app)).toBe(404);
        expect(await statusOf(preview)).toBe(200);

        await prisma.asset.update({ where: { id: TARGET }, data: { status: "draft" } });
        expect(await statusOf(app)).toBe(404);
        expect(await statusOf(preview)).toBe(404);
      } finally {
        await prisma.asset.update({ where: { id: TARGET }, data: { status: original.status } });
        await preview.close();
      }
    });
  });
});
