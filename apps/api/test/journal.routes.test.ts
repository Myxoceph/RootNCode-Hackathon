/**
 * Integration tests: real PostgreSQL (DATABASE_URL). Users created here are deleted afterwards,
 * and their journals with them (cascade from app_user).
 */
import "dotenv/config";
import { JOURNAL_PHOTOS_PER_ENTRY, JournalEntrySchema, JournalPageResponseSchema, JournalPhotoSchema } from "@vagabonds/contracts";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("journal (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  const userIds: string[] = [];

  async function createUser(role: "visitor" | "admin" = "visitor") {
    const token = newToken();
    const user = await prisma.app_user.create({ data: { nickname: "defter", role, sessions: { create: { token_hash: hashToken(token) } } } });
    userIds.push(user.id);
    return { id: user.id, token };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const write = (token: string, text: string | null) => app.inject({ method: "POST", url: "/me/journal", headers: auth(token), payload: { text } });
  const entryOf = async (token: string, text: string | null) => JournalEntrySchema.parse((await write(token, text)).json());
  const list = async (token: string, query = "") => JournalPageResponseSchema.parse((await app.inject({ method: "GET", url: `/me/journal${query}`, headers: auth(token) })).json());
  const photo = (width = 2000, height = 1200) =>
    sharp({ create: { width, height, channels: 3, background: "#884422" } })
      .withExif({ IFD3: { GPSLatitude: "41/1 0/1 0/1" }, IFD0: { Copyright: "gizli-konum" } })
      .jpeg()
      .toBuffer();
  const upload = (token: string | null, entryId: string, body: Buffer, type = "image/jpeg") =>
    app.inject({ method: "POST", url: `/me/journal/${entryId}/photos`, headers: { "content-type": type, ...(token ? auth(token) : {}) }, payload: body });

  beforeAll(() => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false });
  });

  afterAll(async () => {
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("keeps text for its owner only: no other visitor, admin or anonymous caller reaches it", async () => {
    const owner = await createUser();
    const other = await createUser();
    const admin = await createUser("admin");
    const entry = await entryOf(owner.token, "  Ulu Cami'de bir öğle  ");
    expect(entry.text).toBe("Ulu Cami'de bir öğle");

    expect((await list(owner.token)).items.map((item) => item.id)).toEqual([entry.id]);
    for (const stranger of [other, admin]) {
      expect((await list(stranger.token)).items).toEqual([]);
      for (const request of [
        { method: "PATCH", url: `/me/journal/${entry.id}`, payload: { text: "x" } },
        { method: "DELETE", url: `/me/journal/${entry.id}` },
      ] as const) {
        expect((await app.inject({ ...request, headers: auth(stranger.token) })).statusCode).toBe(404);
      }
      expect((await upload(stranger.token, entry.id, await photo())).statusCode).toBe(404);
    }
    expect((await app.inject({ method: "GET", url: "/me/journal" })).statusCode).toBe(401);
    expect((await upload(null, entry.id, await photo())).statusCode).toBe(401);
    expect((await list(owner.token)).items[0]!.text).toBe("Ulu Cami'de bir öğle");
  });

  it("makes both sizes on the server, without the photo's metadata, and serves them only by signed path", async () => {
    const { token } = await createUser();
    const entry = await entryOf(token, null);
    const response = await upload(token, entry.id, await photo());
    expect(response.statusCode, response.body).toBe(201);
    const made = JournalPhotoSchema.parse(response.json());
    expect(made).toMatchObject({ width: 2000, height: 1200 });

    const thumb = await app.inject({ method: "GET", url: made.thumbUrl });
    const full = await app.inject({ method: "GET", url: made.fullUrl });
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers["content-type"]).toBe("image/webp");
    expect(thumb.headers["cache-control"]).toMatch(/^private/);
    expect((await sharp(thumb.rawPayload).metadata()).width).toBe(640);
    expect((await sharp(full.rawPayload).metadata()).width).toBe(1600);
    expect(thumb.rawPayload.length).toBeLessThan(full.rawPayload.length + 1);
    expect((await sharp(full.rawPayload).metadata()).exif).toBeUndefined();

    const bare = made.thumbUrl.split("?")[0]!;
    expect((await app.inject({ method: "GET", url: bare })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `${bare}?exp=9999999999999&sig=wrong` })).statusCode).toBe(404);
    // A signature for another photo does not open this one.
    const second = JournalPhotoSchema.parse((await upload(token, entry.id, await photo(800, 800))).json());
    const signature = made.thumbUrl.split("?")[1]!;
    expect((await app.inject({ method: "GET", url: `${second.thumbUrl.split("?")[0]}?${signature}` })).statusCode).toBe(404);

    // The list carries paths, never files.
    const page = await app.inject({ method: "GET", url: "/me/journal", headers: auth(token) });
    expect(page.body.length).toBeLessThan(4000);
    expect(page.headers["cache-control"]).toBe("no-store");
  });

  it("does not enlarge a small photo, and refuses what is not a photo", async () => {
    const { token } = await createUser();
    const entry = await entryOf(token, "küçük");
    const small = JournalPhotoSchema.parse((await upload(token, entry.id, await photo(300, 200))).json());
    expect((await sharp((await app.inject({ method: "GET", url: small.fullUrl })).rawPayload).metadata()).width).toBe(300);
    expect((await upload(token, entry.id, Buffer.from("not an image"))).statusCode).toBe(400);
    const json = await app.inject({ method: "POST", url: `/me/journal/${entry.id}/photos`, headers: auth(token), payload: { a: 1 } });
    expect(json.statusCode).toBe(415);
  });

  it("holds a limited number of photos in an entry, and delete takes the files with it", async () => {
    const { id, token } = await createUser();
    const entry = await entryOf(token, null);
    const small = await photo(100, 100);
    let last = "";
    for (let i = 0; i < JOURNAL_PHOTOS_PER_ENTRY; i++) {
      const response = await upload(token, entry.id, small);
      expect(response.statusCode, response.body).toBe(201);
      last = JournalPhotoSchema.parse(response.json()).thumbUrl;
    }
    expect((await upload(token, entry.id, small)).statusCode).toBe(409);

    const del = await app.inject({ method: "DELETE", url: `/me/journal/${entry.id}`, headers: auth(token) });
    expect(del.statusCode).toBe(204);
    expect(await prisma.journal_photo.count({ where: { user_id: id } })).toBe(0);
    expect((await app.inject({ method: "GET", url: last })).statusCode).toBe(404);
  });

  it("hides an entry until it has text or a photo, and pages newest first without gaps", async () => {
    const { token } = await createUser();
    const empty = await entryOf(token, "   ");
    expect(empty.text).toBeNull();
    expect((await list(token)).total).toBe(0);

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await entryOf(token, `sayfa ${i}`)).id);
    const first = await list(token, "?limit=2");
    expect(first.total).toBe(5);
    const second = await list(token, `?limit=2&cursor=${first.nextCursor}`);
    const third = await list(token, `?limit=2&cursor=${second.nextCursor}`);
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(ids.reverse());
    expect((await app.inject({ method: "GET", url: "/me/journal?cursor=bad", headers: auth(token) })).statusCode).toBe(400);
  });

  it("removes one photo, and only for its owner", async () => {
    const owner = await createUser();
    const other = await createUser();
    const entry = await entryOf(owner.token, "yazı kalır");
    const made = JournalPhotoSchema.parse((await upload(owner.token, entry.id, await photo(100, 100))).json());
    const url = `/me/journal/photos/${made.id}`;
    expect((await app.inject({ method: "DELETE", url, headers: auth(other.token) })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url, headers: auth(owner.token) })).statusCode).toBe(204);
    expect((await list(owner.token)).items[0]).toMatchObject({ text: "yazı kalır", photos: [] });
  });

  describe("a page arranged by hand", () => {
    const placed = (id: string) => ({ id, x: 0.2, y: 0.4, width: 0.5, rotation: -12.5, z: 3 });
    const text = { x: 0.1, y: 1.2, width: 0.7, z: 1 };

    it("keeps where things lie, and goes back to the usual layout on null", async () => {
      const { token } = await createUser();
      const photoId = "4f1c2a7e-3b5d-4c8e-9a10-6d7e8f901234";
      const made = await app.inject({ method: "POST", url: "/me/journal", headers: auth(token), payload: { text: "yerleşim", layout: { photos: [placed(photoId)], text } } });
      expect(made.statusCode, made.body).toBe(201);
      const entry = JournalEntrySchema.parse(made.json());
      expect(entry.layout?.photos[0]).toMatchObject({ id: photoId, rotation: -12.5 });

      const moved = { photos: [{ ...placed(photoId), x: 0.6 }], text };
      const patched = await app.inject({ method: "PATCH", url: `/me/journal/${entry.id}`, headers: auth(token), payload: { text: "yerleşim", layout: moved } });
      expect(JournalEntrySchema.parse(patched.json()).layout?.photos[0]?.x).toBe(0.6);

      // Writing without a layout leaves it where it is.
      const textOnly = await app.inject({ method: "PATCH", url: `/me/journal/${entry.id}`, headers: auth(token), payload: { text: "yeni yazı" } });
      expect(JournalEntrySchema.parse(textOnly.json())).toMatchObject({ text: "yeni yazı", layout: moved });

      const reset = await app.inject({ method: "PATCH", url: `/me/journal/${entry.id}`, headers: auth(token), payload: { text: "yeni yazı", layout: null } });
      expect(JournalEntrySchema.parse(reset.json()).layout).toBeNull();
      expect((await list(token)).items[0]!.layout).toBeNull();
    });

    it("keeps stickers, lists a page of nothing else, and refuses too many", async () => {
      const { token } = await createUser();
      const sticker = (at: number) => ({ id: `00000000-0000-4000-8000-${String(at).padStart(12, "0")}`, sticker: "cat", x: 0.3, y: 0.2, width: 0.28, rotation: 4, z: at + 2 });
      const made = await app.inject({ method: "POST", url: "/me/journal", headers: auth(token), payload: { text: null, layout: { photos: [], text, stickers: [sticker(0)] } } });
      expect(made.statusCode).toBe(201);
      const listed = (await list(token)).items[0]!;
      expect(listed.layout?.stickers).toEqual([sticker(0)]);
      expect(listed.layout?.strokes).toEqual([]);
      const over = await app.inject({ method: "PATCH", url: `/me/journal/${listed.id}`, headers: auth(token), payload: { text: null, layout: { photos: [], text, stickers: Array.from({ length: 21 }, (_unused, at) => sticker(at)) } } });
      expect(over.statusCode).toBe(400);
      const odd = await app.inject({ method: "PATCH", url: `/me/journal/${listed.id}`, headers: auth(token), payload: { text: null, layout: { photos: [], text, stickers: [{ ...sticker(0), sticker: "<script>" }] } } });
      expect(odd.statusCode).toBe(400);
      // All taken off: the page holds nothing any more.
      await app.inject({ method: "PATCH", url: `/me/journal/${listed.id}`, headers: auth(token), payload: { text: null, layout: { photos: [], text, stickers: [] } } });
      expect((await list(token)).total).toBe(0);
    });

    it("keeps a drawing, lists a page of nothing else, and refuses too much of it", async () => {
      const { token } = await createUser();
      const stroke = { color: "green", size: "thin", d: "120,80 3,-2 4,0" };
      const made = await app.inject({ method: "POST", url: "/me/journal", headers: auth(token), payload: { text: null, layout: { photos: [], text, strokes: [stroke] } } });
      expect(made.statusCode, made.body).toBe(201);
      const entry = JournalEntrySchema.parse(made.json());
      expect((await list(token)).items.map((item) => item.id)).toEqual([entry.id]);
      expect((await list(token)).items[0]!.layout?.strokes).toEqual([stroke]);

      // The largest drawing allowed goes through the body limit; one over it does not.
      const point = "123,456 ";
      const full = point.repeat(Math.floor(15_000 / point.length)).trim();
      const large = await app.inject({ method: "PATCH", url: `/me/journal/${entry.id}`, headers: auth(token), payload: { text: null, layout: { photos: [], text, strokes: [{ ...stroke, d: full }, { ...stroke, d: full }, { ...stroke, d: full }] } } });
      expect(large.statusCode, large.body.slice(0, 200)).toBe(200);
      const over = await app.inject({ method: "PATCH", url: `/me/journal/${entry.id}`, headers: auth(token), payload: { text: null, layout: { photos: [], text, strokes: Array.from({ length: 4 }, () => ({ ...stroke, d: full })) } } });
      expect(over.statusCode).toBe(400);
      for (const d of ["", "1,2,3", "a,b", "1,2 x"]) {
        const bad = await app.inject({ method: "PATCH", url: `/me/journal/${entry.id}`, headers: auth(token), payload: { text: null, layout: { photos: [], text, strokes: [{ ...stroke, d }] } } });
        expect(bad.statusCode, d).toBe(400);
      }

      // Rubbed out to nothing: the page holds nothing any more.
      await app.inject({ method: "PATCH", url: `/me/journal/${entry.id}`, headers: auth(token), payload: { text: null, layout: { photos: [], text, strokes: [] } } });
      expect((await list(token)).total).toBe(0);
    });

    it("refuses a layout that is not one", async () => {
      const { token } = await createUser();
      for (const layout of [{ photos: [], text: { ...text, x: 99 } }, { photos: [{ id: "nope", x: 0, y: 0, width: 0.5, rotation: 0, z: 0 }], text }, { photos: [] }]) {
        const response = await app.inject({ method: "POST", url: "/me/journal", headers: auth(token), payload: { text: "x", layout } });
        expect(response.statusCode, JSON.stringify(layout)).toBe(400);
      }
    });

    it("takes the app's own id for a photo: the same one again changes nothing, and it cannot be another's", async () => {
      const owner = await createUser();
      const other = await createUser();
      const entry = await entryOf(owner.token, "x");
      const otherEntry = await entryOf(other.token, "y");
      const id = "7a2b9c1d-4e6f-4a8b-9c0d-1e2f3a4b5c6d";
      const send = (token: string, entryId: string) =>
        app.inject({ method: "POST", url: `/me/journal/${entryId}/photos?id=${id}`, headers: { "content-type": "image/jpeg", ...auth(token) }, payload: small });
      const small = await photo(100, 100);

      const first = await send(owner.token, entry.id);
      expect(first.statusCode, first.body).toBe(201);
      expect(JournalPhotoSchema.parse(first.json()).id).toBe(id);
      expect(JournalPhotoSchema.parse((await send(owner.token, entry.id)).json()).id).toBe(id);
      expect((await list(owner.token)).items.find((item) => item.id === entry.id)!.photos).toHaveLength(1);

      expect((await send(other.token, otherEntry.id)).statusCode).toBe(409);
      const notAnId = await app.inject({ method: "POST", url: `/me/journal/${entry.id}/photos?id=nope`, headers: { "content-type": "image/jpeg", ...auth(owner.token) }, payload: small });
      expect(notAnId.statusCode).toBe(400);
    });
  });
});
