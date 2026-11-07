/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset imported, and a store that keeps
 * the files in memory. Users and photos created here are deleted afterwards.
 */
import "dotenv/config";
import { ADMIN_PHOTO_MAX_BYTES, AdminAssetRecordResponseSchema, AdminPhotoUploadResponseSchema, AssetDetailSchema } from "@vagabonds/contracts";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import type { MediaStore } from "../src/modules/admin/media-store.ts";
import { InvalidPhotoError, processPhoto } from "../src/modules/admin/photo-process.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const MARKER = "Gizli Konum 40.18N";

/** A photo no other test has: its colour comes from the seed. */
function photo(seed: number, width = 900, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: { r: seed % 256, g: (seed >> 8) % 256, b: 90 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: MARKER } })
    .toBuffer();
}

describe("processPhoto", () => {
  it("makes WebP and JPEG at the pipeline's widths, without enlarging or metadata", async () => {
    const result = await processPhoto(await photo(1, 1500, 1000));
    expect(result.variants.map((v) => `${v.width}.${v.format}`)).toEqual(["480.webp", "480.jpg", "1280.webp", "1280.jpg", "1500.webp", "1500.jpg"]);
    expect(result).toMatchObject({ width: 1500, height: 1000, aspectRatio: 1.5 });
    expect(result.lqip).toMatch(/^data:image\/webp;base64,/);
    expect(result.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
    for (const v of result.variants) expect(v.bytes.toString("latin1")).not.toContain(MARKER);
  });

  it("caps at 2560 px and applies the EXIF orientation", async () => {
    expect((await processPhoto(await photo(2, 3000, 400))).variants.at(-1)?.width).toBe(2560);
    const turned = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#884422" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect(await processPhoto(turned)).toMatchObject({ width: 400, height: 800 });
  });

  it("refuses what is not a photo, a small one and an SVG", async () => {
    await expect(processPhoto(Buffer.from("not an image"))).rejects.toBeInstanceOf(InvalidPhotoError);
    await expect(processPhoto(await photo(3, 200, 200))).rejects.toThrow("at least 300");
    await expect(processPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"/>'))).rejects.toThrow("JPEG, PNG or WebP");
  });
});

describe.skipIf(!DATABASE_URL)("photos uploaded from the panel (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  let off: ReturnType<typeof buildApp>;
  let admin: string;
  let moderator: string;
  let asset: string;
  const userIds: string[] = [];
  const files = new Map<string, string>();
  const seeds = { next: Date.now() % 100_000 };
  const uploaded: Array<{ asset: string; key: string }> = [];

  const store: MediaStore = {
    put: async (key, bytes, type) => void files.set(key, `${type}:${bytes.length}`),
    remove: async (key) => void files.delete(key),
  };

  async function createUser(role: "visitor" | "moderator" | "admin") {
    const token = newToken();
    const user = await prisma.app_user.create({ data: { nickname: `foto-${role}`, role, sessions: { create: { token_hash: hashToken(token) } } } });
    userIds.push(user.id);
    return token;
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function upload(token: string | null, body: Buffer, { id = asset, query = "alt=Kemerli%20ta%C3%A7kap%C4%B1&credit=Vak%C4%B1f%20Kat%C4%B1l%C4%B1m", type = "image/jpeg", on = app } = {}) {
    return on.inject({
      method: "POST",
      url: `/admin/assets/${id}/media?${query}`,
      headers: { "content-type": type, ...(token ? auth(token) : {}) },
      payload: body,
    });
  }
  async function uploadOk(body?: Buffer, options?: Parameters<typeof upload>[2]) {
    const response = await upload(admin, body ?? (await photo(seeds.next++)), options);
    expect(response.statusCode, response.body).toBe(201);
    const { media } = AdminPhotoUploadResponseSchema.parse(response.json());
    uploaded.push({ asset: options?.id ?? asset, key: media.key });
    return media;
  }
  const remove = (id: string, key: string, token = admin) => app.inject({ method: "DELETE", url: `/admin/assets/${id}/media/${key}`, headers: auth(token) });
  const coverOf = async (id: string) => (await prisma.asset_media.findFirst({ where: { asset_id: id, is_cover: true }, select: { media_key: true } }))?.media_key;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false, mediaStore: store, mediaBaseUrl: "https://media.test" });
    off = buildApp({ prisma, rateLimit: false });
    admin = await createUser("admin");
    moderator = await createUser("moderator");
    asset = (await prisma.asset_media.findFirstOrThrow({ where: { is_cover: true, asset: { status: "published" } }, select: { asset_id: true } })).asset_id;
  });

  beforeEach(async () => {
    for (const { asset: id, key } of uploaded.splice(0)) await remove(id, key);
    files.clear();
  });

  afterAll(async () => {
    for (const { asset: id, key } of uploaded) await remove(id, key);
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await off.close();
    await prisma.$disconnect();
  });

  it("stores the files and shows the photo on the asset and in the record", async () => {
    const before = await coverOf(asset);
    const media = await uploadOk();
    expect(media).toMatchObject({ kind: "photo", isCover: false, alt: "Kemerli taçkapı", caption: "Kemerli taçkapı", credit: "Vakıf Katılım", width: 900, height: 600 });
    expect(media.sources.webp.map((s) => s.url)).toContain(`https://media.test/assets/${asset}/${media.key}/480.webp`);
    expect([...files.keys()].sort()).toEqual(["480.jpg", "480.webp", "900.jpg", "900.webp"].map((f) => `assets/${asset}/${media.key}/${f}`));
    expect(files.get(`assets/${asset}/${media.key}/480.webp`)).toMatch(/^image\/webp:/);

    const detail = AssetDetailSchema.parse((await app.inject({ method: "GET", url: `/assets/${asset}` })).json());
    expect(detail.media.at(-1)?.key).toBe(media.key);
    expect(await coverOf(asset)).toBe(before);
    const { record } = AdminAssetRecordResponseSchema.parse((await app.inject({ method: "GET", url: `/admin/assets/${asset}/record`, headers: auth(admin) })).json());
    expect(record.media.find((m) => m.key === media.key)?.uploaded).toBe(true);
    expect(record.media.filter((m) => m.uploaded)).toHaveLength(1);
  });

  it("makes it the cover when asked, and the next photo the cover when it goes", async () => {
    const before = await coverOf(asset);
    const media = await uploadOk(undefined, { query: "alt=Kapak%20foto&credit=Test&isCover=true" });
    expect(media.isCover).toBe(true);
    expect(await prisma.asset_media.count({ where: { asset_id: asset, is_cover: true } })).toBe(1);

    expect((await remove(asset, media.key)).statusCode).toBe(204);
    uploaded.length = 0;
    expect(await prisma.asset_media.count({ where: { asset_id: asset, is_cover: true } })).toBe(1);
    expect(await prisma.media.count({ where: { asset_media: { none: {} }, source_provider: "panel" } })).toBe(0);
    expect(files.size).toBe(0);
    // The dataset's cover is put back by hand here; a real import does the same.
    await prisma.asset_media.updateMany({ where: { asset_id: asset }, data: { is_cover: false } });
    await prisma.asset_media.updateMany({ where: { asset_id: asset, media_key: before! }, data: { is_cover: true } });
  });

  it("takes a photo once per asset and shares its files between assets", async () => {
    const body = await photo(seeds.next++);
    const media = await uploadOk(body);
    const again = await upload(admin, body);
    expect([again.statusCode, again.json().error.code]).toEqual([409, "PHOTO_ON_ASSET"]);

    const other = (await prisma.asset_media.findFirstOrThrow({ where: { is_cover: true, asset_id: { not: asset } }, select: { asset_id: true } })).asset_id;
    const count = files.size;
    const shared = await uploadOk(body, { id: other });
    expect(files.size).toBe(count);
    expect(shared.sources.webp[0]?.url).toBe(media.sources.webp[0]?.url);

    // The files stay while another asset has the photo.
    expect((await remove(other, shared.key)).statusCode).toBe(204);
    expect(files.size).toBe(count);
    uploaded.splice(uploaded.findIndex((u) => u.asset === other), 1);
  });

  it("does not remove the dataset's photos, and answers for an unknown one", async () => {
    const dataset = await prisma.asset_media.findFirstOrThrow({ where: { asset_id: asset, panel_upload: false }, select: { media_key: true } });
    const refused = await remove(asset, dataset.media_key);
    expect([refused.statusCode, refused.json().error.code]).toEqual([409, "DATASET_PHOTO"]);
    expect((await remove(asset, "p-yok")).statusCode).toBe(404);
  });

  it("refuses bad requests, and everyone but an admin", async () => {
    const body = await photo(seeds.next++);
    expect((await upload(null, body)).statusCode).toBe(401);
    expect((await upload(moderator, body)).statusCode).toBe(403);
    expect((await remove(asset, "p-yok", moderator)).statusCode).toBe(403);
    expect((await upload(admin, body, { id: "yok-boyle-bir-eser" })).statusCode).toBe(404);
    expect((await upload(admin, body, { query: "credit=Test" })).statusCode).toBe(400);
    expect((await upload(admin, body, { query: "alt=Kemer" })).statusCode).toBe(400);
    const invalid = await upload(admin, Buffer.from("not an image"));
    expect([invalid.statusCode, invalid.json().error.code]).toEqual([400, "INVALID_IMAGE"]);
    expect((await upload(admin, Buffer.alloc(ADMIN_PHOTO_MAX_BYTES + 1))).statusCode).toBe(413);
    expect((await upload(admin, body, { type: "image/gif" })).statusCode).toBe(415);
    expect(files.size).toBe(0);
  });

  it("answers 503 on a server without a store", async () => {
    const response = await upload(admin, await photo(seeds.next++), { on: off });
    expect([response.statusCode, response.json().error.code]).toEqual([503, "MEDIA_UPLOAD_OFF"]);
  });
});
