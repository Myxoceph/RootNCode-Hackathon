/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the imported dataset. data/sounds.json
 * starts empty, so a recording is added for the test and removed afterwards.
 */
import "dotenv/config";
import { AssetDetailSchema, MetaSoundsResponseSchema } from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
// A key no asset or type uses, so the test never touches a real recording.
const KEY = "test-hamam";

describe.skipIf(!DATABASE_URL)("sounds routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  let assetId: string;
  let ownKey: string | null;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, mediaBaseUrl: "https://media.test" });
    await prisma.sound.create({
      data: {
        key: KEY, sort_order: 0, title_tr: "Hamam", title_en: "Bathhouse", file_key: `sounds/${KEY}.mp3`,
        duration_seconds: 24, license: "CC-BY-4.0", author: "Test Kaydı", source_url: "https://freesound.org/s/1/",
        status: "published",
        captions: [
          { at: 0, text_tr: "[Kurnadan su dökülür]", text_en: "[Water pours from the basin]" },
          { at: 11, text_tr: "[Buhar tıslar]", text_en: null },
        ],
      },
    });
    // Point one published hamam at the test key for the detail check; restored afterwards.
    const asset = await prisma.asset.findFirstOrThrow({
      where: { type_code: "hamam", status: "published" },
      select: { id: true, ambient_sound_key: true },
      orderBy: { id: "asc" },
    });
    assetId = asset.id;
    ownKey = asset.ambient_sound_key;
    await prisma.asset.update({ where: { id: assetId }, data: { ambient_sound_key: KEY } });
  });

  afterAll(async () => {
    await prisma.asset.update({ where: { id: assetId }, data: { ambient_sound_key: ownKey } });
    await prisma.sound.delete({ where: { key: KEY } });
    await app.close();
    await prisma.$disconnect();
  });

  async function get(url: string) {
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode, response.body).toBe(200);
    return response.json();
  }

  it("lists the published recordings with captions and a credit line", async () => {
    const body = MetaSoundsResponseSchema.parse(await get("/meta/sounds?lang=en"));
    expect(body.sounds.find((s) => s.key === KEY)).toEqual({
      key: KEY,
      title: "Bathhouse",
      url: `https://media.test/sounds/${KEY}.mp3`,
      durationSeconds: 24,
      // A caption without English falls back to Turkish.
      captions: [{ at: 0, text: "[Water pours from the basin]" }, { at: 11, text: "[Buhar tıslar]" }],
      license: "CC-BY-4.0",
      credit: "Sound: Test Kaydı (CC BY 4.0)",
      sourceUrl: "https://freesound.org/s/1/",
    });
  });

  it("puts the recording into the asset's ambientSound", async () => {
    const detail = AssetDetailSchema.parse(await get(`/assets/${assetId}`));
    expect(detail.ambientSound).toMatchObject({
      key: KEY,
      recording: { url: `https://media.test/sounds/${KEY}.mp3`, credit: "Ses: Test Kaydı (CC BY 4.0)" },
    });
  });

  it("hides drafts and leaves recording null for a key without one", async () => {
    await prisma.sound.update({ where: { key: KEY }, data: { status: "draft" } });
    try {
      const body = MetaSoundsResponseSchema.parse(await get("/meta/sounds"));
      expect(body.sounds.find((s) => s.key === KEY)).toBeUndefined();
      const detail = AssetDetailSchema.parse(await get(`/assets/${assetId}`));
      expect(detail.ambientSound).toMatchObject({ key: KEY, recording: null });
    } finally {
      await prisma.sound.update({ where: { key: KEY }, data: { status: "published" } });
    }
  });
});
