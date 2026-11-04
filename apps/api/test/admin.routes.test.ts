/**
 * Integration tests: real PostgreSQL (DATABASE_URL) with the dataset imported.
 * Users, contributions and panel assets created here are deleted afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  AdminAssetRecordResponseSchema,
  AdminAssetSchema,
  AdminAssetsResponseSchema,
  AdminSummaryResponseSchema,
  AdminUserSchema,
  AdminUsersResponseSchema,
  AssetDetailSchema,
  ModerationListResponseSchema,
} from "@vagabonds/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { jpegWithExif } from "./helpers/images.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const ASSET = "bursa-osmangazi-ordekli-hamam";

describe.skipIf(!DATABASE_URL)("admin panel (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: ReturnType<typeof buildApp>;
  const userIds: string[] = [];
  // Unique per run: panel asset ids come from the name.
  const tag = randomUUID().slice(0, 6);
  let admin: { id: string; token: string };
  let moderator: { id: string; token: string };
  let visitor: { id: string; token: string };

  async function createUser(role: "visitor" | "moderator" | "admin", nickname: string, username: string | null = null) {
    const token = newToken();
    const user = await prisma.app_user.create({
      data: {
        nickname,
        role,
        ...(username && { username, password_hash: "scrypt$1$1$1$x$y" }),
        sessions: { create: { token_hash: hashToken(token) } },
      },
    });
    userIds.push(user.id);
    return { id: user.id, token };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token: string, payload?: object) =>
    app.inject({ method, url, headers: auth(token), ...(payload && { payload }) });

  const newAsset = (overrides: object = {}) => ({
    name: { tr: `Panel Çeşmesi ${tag}` },
    type: "cesme",
    city: "bursa",
    district: "Osmangazi",
    summary: { tr: "Mahalle arasında küçük bir çeşme." },
    description: { tr: "Çeşme kesme taştan yapılmıştır ve kitabesi yoktur." },
    ...overrides,
  });

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false });
    admin = await createUser("admin", "Panel Admin", `admin_${tag}`);
    moderator = await createUser("moderator", "Panel Moderatör");
    visitor = await createUser("visitor", `Ziyaretçi ${tag}`);
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { prepared_by: `admin:admin_${tag}` } });
    await prisma.contribution.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { reviewed_by: { in: userIds } }] } });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("shows moderators the pending notes and photos apart, and filters the queue the same way", async () => {
    await call("POST", `/assets/${ASSET}/contributions`, visitor.token, { kind: "tip", body: "Kapı öğlen kapanıyor." });
    await app.inject({
      method: "POST",
      url: `/assets/${ASSET}/photos?caption=Kubbe`,
      headers: { ...auth(visitor.token), "content-type": "image/jpeg" },
      payload: jpegWithExif(),
    });

    const summary = AdminSummaryResponseSchema.parse((await call("GET", "/admin/summary", moderator.token)).json());
    expect(summary.pending.notes).toBeGreaterThanOrEqual(1);
    expect(summary.pending.photos).toBeGreaterThanOrEqual(1);
    expect((await call("GET", "/admin/summary", visitor.token)).statusCode).toBe(403);

    const photos = ModerationListResponseSchema.parse((await call("GET", "/admin/contributions?kind=photos&limit=100", moderator.token)).json());
    const notes = ModerationListResponseSchema.parse((await call("GET", "/admin/contributions?kind=notes&limit=100", moderator.token)).json());
    expect(photos.items.every((i) => i.kind === "photo")).toBe(true);
    expect(notes.items.every((i) => i.kind !== "photo")).toBe(true);
  });

  it("lists and finds users, and lets only an admin change roles, never their own", async () => {
    const found = AdminUsersResponseSchema.parse((await call("GET", `/admin/users?q=${encodeURIComponent(`ziyaretçi ${tag}`)}`, moderator.token)).json());
    expect(found.items.map((u) => u.id)).toEqual([visitor.id]);
    expect(found.items[0]!.contributions).toBeGreaterThanOrEqual(2);

    expect((await call("POST", `/admin/users/${visitor.id}/role`, moderator.token, { role: "moderator" })).statusCode).toBe(403);
    const promoted = await call("POST", `/admin/users/${visitor.id}/role`, admin.token, { role: "moderator" });
    expect(AdminUserSchema.parse(promoted.json()).role).toBe("moderator");
    await call("POST", `/admin/users/${visitor.id}/role`, admin.token, { role: "visitor" });

    const own = await call("POST", `/admin/users/${admin.id}/role`, admin.token, { role: "visitor" });
    expect([own.statusCode, own.json().error.code]).toEqual([400, "OWN_ROLE"]);
    expect((await call("POST", `/admin/users/${randomUUID()}/role`, admin.token, { role: "visitor" })).statusCode).toBe(404);
  });

  it("unbans a user", async () => {
    const banned = await createUser("visitor", "Affedilen");
    await call("POST", `/admin/users/${banned.id}/ban`, moderator.token);
    const unbanned = await call("POST", `/admin/users/${banned.id}/unban`, moderator.token);
    expect(AdminUserSchema.parse(unbanned.json()).bannedAt).toBeNull();
    expect((await app.inject({ method: "GET", url: "/me", headers: auth(banned.token) })).statusCode).toBe(200);
  });

  it("adds a draft asset that visitors cannot see, then publishes it", async () => {
    const created = await call("POST", "/admin/assets", admin.token, newAsset());
    expect(created.statusCode, created.body).toBe(201);
    const asset = AdminAssetSchema.parse(created.json());
    expect(asset).toMatchObject({ id: `bursa-osmangazi-panel-cesmesi-${tag}`, status: "draft", createdBy: `admin_${tag}`, type: "Çeşme" });
    expect((await app.inject({ method: "GET", url: `/assets/${asset.id}` })).statusCode).toBe(404);
    const preview = await call("GET", `/admin/assets/${asset.id}/preview`, admin.token);
    expect(preview.statusCode, preview.body).toBe(200);
    expect(AssetDetailSchema.parse(preview.json())).toMatchObject({ id: asset.id, name: `Panel Çeşmesi ${tag}` });
    expect((await call("GET", `/admin/assets/${asset.id}/preview`, moderator.token)).statusCode).toBe(403);

    const stored = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id }, select: { source_json: true } });
    expect(stored.source_json).toMatchObject({ id: asset.id, meta: { prepared_by: `admin:admin_${tag}`, status: "draft" }, location: { region: "marmara" } });

    const published = await call("PATCH", `/admin/assets/${asset.id}`, admin.token, { status: "published", coordinates: { lat: 40.19, lng: 29.06 } });
    expect(published.statusCode, published.body).toBe(200);
    expect(AdminAssetSchema.parse(published.json()).status).toBe("published");
    const detail = AssetDetailSchema.parse((await app.inject({ method: "GET", url: `/assets/${asset.id}` })).json());
    expect(detail).toMatchObject({ name: `Panel Çeşmesi ${tag}`, summary: "Mahalle arasında küçük bir çeşme.", coordinates: { lat: 40.19, lng: 29.06 } });
    expect(detail.sections.map((s) => s.title)).toEqual(["Tanıtım"]);

    const list = AdminAssetsResponseSchema.parse((await call("GET", "/admin/assets", admin.token)).json());
    expect(list.items.some((a) => a.id === asset.id)).toBe(true);
  });

  it("rejects unknown codes and taken ids, and does not delete dataset assets", async () => {
    const unknown = await call("POST", "/admin/assets", admin.token, newAsset({ name: { tr: `Kod ${tag}` }, type: "uzay-ussu" }));
    expect([unknown.statusCode, unknown.json().error.code]).toEqual([400, "UNKNOWN_CODE"]);

    await call("POST", "/admin/assets", admin.token, newAsset({ name: { tr: `İkiz ${tag}` } }));
    const twin = await call("POST", "/admin/assets", admin.token, newAsset({ name: { tr: `İkiz ${tag}` } }));
    expect([twin.statusCode, twin.json().error.code]).toEqual([409, "ASSET_EXISTS"]);

    expect((await call("PATCH", `/admin/assets/${ASSET}`, admin.token, { type: "uzay-ussu" })).statusCode).toBe(400);
    expect((await call("DELETE", `/admin/assets/${ASSET}`, admin.token)).statusCode).toBe(404);
    expect((await call("POST", "/admin/assets", moderator.token, newAsset({ name: { tr: `Mod ${tag}` } }))).statusCode).toBe(403);
  });

  it("lists dataset assets and edits one in place, keeping its other sections", async () => {
    const list = AdminAssetsResponseSchema.parse((await call("GET", "/admin/assets", admin.token)).json());
    expect(list.items.find((a) => a.id === ASSET)).toMatchObject({ origin: "dataset", status: "published" });

    const getRecord = async () => AdminAssetRecordResponseSchema.parse((await call("GET", `/admin/assets/${ASSET}/record`, admin.token)).json()).record;
    const before = await getRecord();
    const sections = await prisma.asset_section.count({ where: { asset_id: ASSET } });
    try {
      const edited = await call("PATCH", `/admin/assets/${ASSET}`, admin.token, { summary: { tr: `Panelden özet ${tag}` }, description: { tr: `Panelden metin ${tag}` } });
      expect(edited.statusCode, edited.body).toBe(200);
      expect(AdminAssetSchema.parse(edited.json()).origin).toBe("dataset");
      const after = await getRecord();
      expect(after.summary.tr).toBe(`Panelden özet ${tag}`);
      expect(after.sections[0]!.body.tr).toBe(`Panelden metin ${tag}`);
      expect(after.sections.slice(1)).toEqual(before.sections.slice(1));
      expect(await prisma.asset_section.count({ where: { asset_id: ASSET } })).toBe(sections);
      expect(AssetDetailSchema.parse((await app.inject({ method: "GET", url: `/assets/${ASSET}` })).json()).summary).toBe(`Panelden özet ${tag}`);
    } finally {
      await call("PUT", `/admin/assets/${ASSET}/record`, admin.token, before);
    }
    expect(await getRecord()).toEqual(before);
  });

  it("reads a dataset asset's whole record and writes it back with changes, keeping sources", async () => {
    const { record } = AdminAssetRecordResponseSchema.parse((await call("GET", `/admin/assets/${ASSET}/record`, admin.token)).json());
    const citations = await prisma.source_citation.count({ where: { asset_id: ASSET } });
    try {
      const edited = {
        ...record,
        subtitle: { tr: `Alt başlık ${tag}`, en: null },
        timeline: [...record.timeline, { id: `olay-${tag}`, year: 1999, date: null, hijri: null, type: "repair", title: { tr: `Onarım ${tag}`, en: null }, note: null, confidence: "certain" as const }],
        people: [...record.people, { name: `Usta ${tag}`, role: { tr: "Usta", en: null } }],
      };
      const saved = await call("PUT", `/admin/assets/${ASSET}/record`, admin.token, edited);
      expect(saved.statusCode, saved.body).toBe(200);
      const detail = AssetDetailSchema.parse((await app.inject({ method: "GET", url: `/assets/${ASSET}` })).json());
      expect(detail.subtitle).toBe(`Alt başlık ${tag}`);
      expect(detail.timeline.some((e) => e.title === `Onarım ${tag}`)).toBe(true);
      expect(detail.people.some((p) => p.name === `Usta ${tag}`)).toBe(true);
      expect(await prisma.source_citation.count({ where: { asset_id: ASSET } })).toBe(citations);

      const bad = await call("PUT", `/admin/assets/${ASSET}/record`, admin.token, { ...record, summary: { tr: " ", en: null } });
      expect(bad.statusCode).toBe(400);
      expect((await call("PUT", `/admin/assets/${ASSET}/record`, moderator.token, record)).statusCode).toBe(403);
    } finally {
      await call("PUT", `/admin/assets/${ASSET}/record`, admin.token, record);
    }
    const restored = AdminAssetRecordResponseSchema.parse((await call("GET", `/admin/assets/${ASSET}/record`, admin.token)).json());
    expect(restored.record).toEqual(record);
  });

  it("adds a new asset with its whole record", async () => {
    const { record: base } = AdminAssetRecordResponseSchema.parse((await call("GET", `/admin/assets/${ASSET}/record`, admin.token)).json());
    const record = {
      ...base,
      status: "draft" as const,
      name: { tr: `Tam Kayıt ${tag}`, en: null },
      media: [],
      facts: [{ key: "yukseklik", label: { tr: "Yükseklik", en: null }, value: "12", unit: "m", note: null, confidence: "certain" as const }],
    };
    const created = await call("POST", "/admin/assets/record", admin.token, record);
    expect(created.statusCode, created.body).toBe(201);
    const { id, origin, record: stored } = AdminAssetRecordResponseSchema.parse(created.json());
    expect(origin).toBe("panel");
    expect(stored.sections.length).toBe(base.sections.length);
    const preview = AssetDetailSchema.parse((await call("GET", `/admin/assets/${id}/preview`, admin.token)).json());
    expect(preview.facts[0]).toMatchObject({ label: "Yükseklik", valueNum: 12, unit: "m" });
    expect((await call("DELETE", `/admin/assets/${id}`, admin.token)).statusCode).toBe(204);
  });

  it("deletes a panel asset", async () => {
    const { id } = AdminAssetSchema.parse((await call("POST", "/admin/assets", admin.token, newAsset({ name: { tr: `Silinecek ${tag}` } }))).json());
    expect((await call("DELETE", `/admin/assets/${id}`, admin.token)).statusCode).toBe(204);
    expect(await prisma.asset.findUnique({ where: { id } })).toBeNull();
  });
});
