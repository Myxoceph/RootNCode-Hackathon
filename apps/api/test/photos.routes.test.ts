/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset imported.
 * Users, photos and contributions created here are deleted afterwards.
 */
import "dotenv/config";
import {
  AppUserSchema,
  AVATAR_MAX_BYTES,
  CommunityPhotosResponseSchema,
  ContributionSchema,
  ModerationListResponseSchema,
  PHOTO_MAX_BYTES,
  PHOTOS_PER_DAY,
} from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { GPS_MARKER, jpegWithExif, pngWithText } from "./helpers/images.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const ASSET = "bursa-osmangazi-ordekli-hamam";

describe.skipIf(!DATABASE_URL)("visitor photos (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  const userIds: string[] = [];
  let moderator: string;

  async function createUser(role: "visitor" | "moderator", nickname: string) {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: { nickname, role, sessions: { create: { token_hash: hashToken(token) } } },
    });
    userIds.push(user.id);
    return { id: user.id, token };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  function upload(token: string | null, body: Buffer, { type = "image/jpeg", caption = "Avludan kubbeler", asset = ASSET } = {}) {
    return app.inject({
      method: "POST",
      url: `/assets/${asset}/photos?caption=${encodeURIComponent(caption)}`,
      headers: { "content-type": type, ...(token ? auth(token) : {}) },
      payload: body,
    });
  }

  async function approve(id: string) {
    const response = await app.inject({ method: "POST", url: `/admin/contributions/${id}/approve`, headers: auth(moderator) });
    expect(response.statusCode, response.body).toBe(200);
  }

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false });
    moderator = (await createUser("moderator", "foto-moderator")).token;
  });

  afterAll(async () => {
    await prisma.contribution.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { reviewed_by: { in: userIds } }] } });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("takes a JPEG as a pending photo without its EXIF, visible to its author and moderators only", async () => {
    const { token } = await createUser("visitor", "Fotoğrafçı");
    const response = await upload(token, jpegWithExif(1600, 1200));
    expect(response.statusCode, response.body).toBe(201);
    const contribution = ContributionSchema.parse(response.json());
    expect(contribution).toMatchObject({ kind: "photo", body: "Avludan kubbeler", status: "pending" });
    expect(contribution.photo).toMatchObject({ width: 1600, height: 1200 });

    const stored = await prisma.photo_upload.findUniqueOrThrow({ where: { contribution_id: contribution.id } });
    expect(Buffer.from(stored.bytes).toString("latin1")).not.toContain(GPS_MARKER);

    // The signed path from the response works; the plain one does not while it waits for review.
    const signed = await app.inject({ method: "GET", url: contribution.photo!.path });
    expect([signed.statusCode, signed.headers["content-type"]]).toEqual([200, "image/jpeg"]);
    expect(signed.headers["cache-control"]).toContain("private");
    expect((await app.inject({ method: "GET", url: `/photos/${contribution.id}` })).statusCode).toBe(404);

    const queue = ModerationListResponseSchema.parse(
      (await app.inject({ method: "GET", url: "/admin/contributions?status=pending&limit=100", headers: auth(moderator) })).json(),
    );
    const item = queue.items.find((i) => i.id === contribution.id);
    expect(item?.photo?.path).toMatch(/^\/photos\/.+\?exp=\d+&sig=/);

    const mine = await app.inject({ method: "GET", url: "/me/contributions", headers: auth(token) });
    expect(mine.json().items[0]).toMatchObject({ kind: "photo", photo: { width: 1600 } });
  });

  it("lists approved photos publicly with the author, and hides them when the author is banned", async () => {
    const visitor = await createUser("visitor", "Kubbe Sever");
    const contribution = ContributionSchema.parse((await upload(visitor.token, pngWithText(800, 600), { type: "image/png", caption: "Soğukluk kubbesi" })).json());
    await approve(contribution.id);

    const list = CommunityPhotosResponseSchema.parse((await app.inject({ method: "GET", url: `/assets/${ASSET}/photos` })).json());
    expect(list.items.find((p) => p.id === contribution.id)).toMatchObject({
      path: `/photos/${contribution.id}`,
      caption: "Soğukluk kubbesi",
      author: "Kubbe Sever",
      width: 800,
    });
    const file = await app.inject({ method: "GET", url: `/photos/${contribution.id}` });
    expect([file.statusCode, file.headers["content-type"]]).toEqual([200, "image/png"]);
    expect(file.headers["cache-control"]).toContain("public");

    await app.inject({ method: "POST", url: `/admin/users/${visitor.id}/ban`, headers: auth(moderator) });
    const after = CommunityPhotosResponseSchema.parse((await app.inject({ method: "GET", url: `/assets/${ASSET}/photos` })).json());
    expect(after.items.some((p) => p.id === contribution.id)).toBe(false);
    expect((await app.inject({ method: "GET", url: `/photos/${contribution.id}` })).statusCode).toBe(404);
  });

  it("rejects what is not a usable photo", async () => {
    const { token } = await createUser("visitor", "Deneyen");
    const cases: Array<[Promise<{ statusCode: number; json(): { error: { code: string } } }>, number, string]> = [
      [upload(null, jpegWithExif()), 401, "UNAUTHORIZED"],
      [upload(token, pngWithText(), { type: "image/jpeg", caption: "Uzantısı yalan" }), 201, ""], // the bytes decide, not the header
      [upload(token, Buffer.from("GIF89a-------"), { type: "image/jpeg" }), 400, "INVALID_IMAGE"],
      [upload(token, jpegWithExif(200, 150)), 400, "INVALID_IMAGE"],
      [upload(token, jpegWithExif(), { caption: "a" }), 400, "INVALID_QUERY"],
      [upload(token, jpegWithExif(), { type: "image/gif" }), 415, "UNSUPPORTED_MEDIA_TYPE"],
      [upload(token, Buffer.alloc(PHOTO_MAX_BYTES + 1, 0xff)), 413, "PAYLOAD_TOO_LARGE"],
      [upload(token, jpegWithExif(), { asset: "bursa-yok-boyle-eser" }), 404, "ASSET_NOT_FOUND"],
    ];
    for (const [request, status, code] of cases) {
      const response = await request;
      expect(response.statusCode, `${status} ${code}`).toBe(status);
      if (code) expect(response.json().error.code).toBe(code);
    }
  });

  it(`limits a user to ${PHOTOS_PER_DAY} photos a day`, async () => {
    const { token } = await createUser("visitor", "Çok Çeken");
    for (let i = 0; i < PHOTOS_PER_DAY; i++) expect((await upload(token, jpegWithExif())).statusCode).toBe(201);
    const limited = await upload(token, jpegWithExif());
    expect([limited.statusCode, limited.json().error.code]).toEqual([429, "PHOTO_LIMIT"]);
  });

  it("does not serve a photo for a forged signature", async () => {
    const { token } = await createUser("visitor", "Sahte İmza");
    const { id } = ContributionSchema.parse((await upload(token, jpegWithExif())).json());
    const forged = await app.inject({ method: "GET", url: `/photos/${id}?exp=${Date.now() + 60_000}&sig=AAAA` });
    expect(forged.statusCode).toBe(404);
  });

  describe("profile photo", () => {
    const putAvatar = (token: string, body: Buffer, type = "image/png") =>
      app.inject({ method: "PUT", url: "/me/avatar", headers: { "content-type": type, ...auth(token) }, payload: body });

    it("keeps one photo per user without its metadata, shown only through the signed path", async () => {
      const { id, token } = await createUser("visitor", "Profilli");
      const first = await putAvatar(token, pngWithText(200, 200));
      expect(first.statusCode, first.body).toBe(200);
      const photoUrl = AppUserSchema.parse(first.json()).photoUrl!;
      expect(photoUrl).toMatch(new RegExp(`^/avatars/${id}\\?v=[0-9a-f]{12}&exp=\\d+&sig=`));

      const file = await app.inject({ method: "GET", url: photoUrl });
      expect([file.statusCode, file.headers["content-type"], file.headers["cache-control"]]).toEqual([200, "image/png", "private, max-age=3600"]);
      expect(file.rawPayload.toString("latin1")).not.toContain(GPS_MARKER);
      expect((await app.inject({ method: "GET", url: `/avatars/${id}` })).statusCode).toBe(404);

      // A new photo replaces the old one and gets a new path; /me gives the same.
      const second = AppUserSchema.parse((await putAvatar(token, jpegWithExif(400, 300), "image/jpeg")).json()).photoUrl!;
      expect(second).not.toBe(photoUrl);
      expect(await prisma.user_avatar.count({ where: { user_id: id } })).toBe(1);
      expect(AppUserSchema.parse((await app.inject({ method: "GET", url: "/me", headers: auth(token) })).json()).photoUrl).toBe(second);

      const removed = await app.inject({ method: "DELETE", url: "/me/avatar", headers: auth(token) });
      expect(AppUserSchema.parse(removed.json()).photoUrl).toBeNull();
      expect((await app.inject({ method: "GET", url: second })).statusCode).toBe(404);
    });

    it("does not open one user's photo with another's signature, nor with a photo's", async () => {
      const owner = await createUser("visitor", "Sahibi");
      const other = await createUser("visitor", "Başkası");
      await putAvatar(owner.token, pngWithText(100, 100));
      const theirs = AppUserSchema.parse((await putAvatar(other.token, pngWithText(100, 100))).json()).photoUrl!;
      const query = theirs.slice(theirs.indexOf("?"));
      expect((await app.inject({ method: "GET", url: `/avatars/${owner.id}${query}` })).statusCode).toBe(404);
    });

    it("refuses what is not a small enough image, and a request without a session", async () => {
      const { token } = await createUser("visitor", "Kurallı");
      expect((await putAvatar(token, pngWithText(32, 32))).statusCode).toBe(400);
      expect((await putAvatar(token, Buffer.from("not an image"), "image/png")).statusCode).toBe(400);
      expect((await putAvatar(token, Buffer.alloc(AVATAR_MAX_BYTES + 1), "image/png")).statusCode).toBe(413);
      const anonymous = await app.inject({ method: "PUT", url: "/me/avatar", headers: { "content-type": "image/png" }, payload: pngWithText(100, 100) });
      expect(anonymous.statusCode).toBe(401);
    });
  });
});
