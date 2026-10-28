import "dotenv/config";
import { MetaEnumsResponseSchema } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("GET /meta/enums (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function enums(query = "") {
    const response = await app.inject({ method: "GET", url: `/meta/enums${query}` });
    expect(response.statusCode).toBe(200);
    return { response, body: MetaEnumsResponseSchema.parse(response.json()) };
  }

  it("counts only the assets clients can see", async () => {
    const { body } = await enums();
    const published = await prisma.asset.count({ where: { status: "published" } });
    const sum = (items: { assetCount: number }[]) => items.reduce((total, item) => total + item.assetCount, 0);

    expect(sum(body.cities)).toBe(published);
    expect(sum(body.assetTypes)).toBe(published);
    expect(sum(body.eras)).toBeLessThanOrEqual(published); // era is optional
  });

  it("lists the codes used in the database and in data/enums.json", async () => {
    const { body } = await enums();

    expect(body.cities.find((city) => city.code === "bursa")).toMatchObject({ region: "marmara", plate: 16 });
    expect(body.relationTypes.map((type) => type.code)).toContain("waqf_income");
    expect(body.confidence.map((item) => item.code)).toEqual(["certain", "probable", "disputed", "legend"]);
    expect(body.accessibilityStatus.map((item) => item.code)).toContain("unknown");
    expect(body.mediaKinds.map((item) => item.code)).toContain("archive_photo");
  });

  it("labels in English on request", async () => {
    const { response, body } = await enums("?lang=en");

    expect(response.headers["content-language"]).toBe("en");
    expect(body.assetTypes.find((type) => type.code === "cami")?.label).toBe("Mosque");
    expect(body.confidence[0]?.label).not.toBe("Kaynakta kesin");
  });

  it("rejects unsupported languages", async () => {
    const response = await app.inject({ method: "GET", url: "/meta/enums?lang=de" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_QUERY");
  });
});
