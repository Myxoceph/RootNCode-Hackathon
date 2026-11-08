/**
 * Integration tests: real PostgreSQL (DATABASE_URL). Sohbetten Kabul (docs/veri-dongusu.md
 * §1.3): photo uploads, starting a chat, adding to it. The worker's part is played by writing the
 * tables directly, as it would.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IntakeJobResponseSchema, IntakeUploadResponseSchema } from "@vagabonds/contracts";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";
import { createLocalMediaStore } from "../src/modules/admin/media-store.ts";
import { hashToken, newToken } from "../src/modules/community/auth.ts";
import { chatTitle } from "../src/modules/intake/intake-chat.routes.ts";

const DATABASE_URL = process.env["DATABASE_URL"];
const DIR = "data/build/cache/intake";

describe("chatTitle", () => {
  it("is the first line the admin wrote, cut short when long", () => {
    expect(chatTitle("\n  Şeyh Ali Çeşmesi  \nHicri 1150'de yapıldı.")).toBe("Şeyh Ali Çeşmesi");
    expect(chatTitle("")).toBe("Fotoğraflar");
    expect(chatTitle("a".repeat(300))).toHaveLength(120);
  });
});

describe.skipIf(!DATABASE_URL)("intake chat routes (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  const root = mkdtempSync(join(tmpdir(), "intake-chat-"));
  const media = join(root, "media");
  const userIds: string[] = [];
  const tag = randomUUID().slice(0, 6);
  let moderator: string;
  let visitor: string;
  let photo: Buffer;

  async function createUser(role: "visitor" | "moderator") {
    const token = newToken();
    const user = await prisma.app_user.create({ data: { nickname: `chat ${role} ${tag}`, role, sessions: { create: { token_hash: hashToken(token) } } } });
    userIds.push(user.id);
    return token;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const post = (url: string, token: string, payload: object) => app.inject({ method: "POST", url, headers: auth(token), payload });
  const upload = async (token = moderator, body = photo, type = "image/jpeg") => {
    const response = await app.inject({ method: "POST", url: "/admin/intake/uploads?name=cesme.jpg", headers: { ...auth(token), "content-type": type }, payload: body });
    return response;
  };
  const uploaded = async () => IntakeUploadResponseSchema.parse((await upload()).json()).upload;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    app = buildApp({ prisma, rateLimit: false, intake: { root, dir: DIR }, mediaStore: createLocalMediaStore(media) });
    moderator = await createUser("moderator");
    visitor = await createUser("visitor");
    // A real photo, with EXIF: the original must reach the worker as it was sent.
    photo = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#8a6a4a" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: `chat-test-${tag}` } })
      .toBuffer();
  });

  afterAll(async () => {
    await prisma.intake_job.deleteMany({ where: { created_by: { in: userIds } } });
    await prisma.app_user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
    rmSync(root, { recursive: true, force: true });
  });

  it("takes a photo, processes it into the media store and keeps the original as sent", async () => {
    const response = await upload();
    expect(response.statusCode).toBe(201);
    const { upload: item } = IntakeUploadResponseSchema.parse(response.json());
    expect(item).toMatchObject({ name: "cesme.jpg", mime: "image/jpeg", width: 1600, height: 1000, key: `intake/${item.id}/1280.jpg` });
    expect(existsSync(join(media, item.key))).toBe(true);
    expect(existsSync(join(media, `intake/${item.id}/480.webp`))).toBe(true);
    expect(readFileSync(join(root, DIR, "uploads", item.id, "original.jpg"))).toEqual(photo);
  });

  it("turns away what is not a photo, and a visitor before reading the body", async () => {
    expect((await upload(moderator, Buffer.from("not a photo"), "image/jpeg")).statusCode).toBe(400);
    expect((await upload(moderator, Buffer.from("%PDF-1.4"), "application/pdf")).statusCode).toBe(415);
    expect((await upload(visitor)).statusCode).toBe(403);
  });

  it("starts a chat with its first message, photos and city, and queues it for the worker", async () => {
    const first = await uploaded();
    const second = await uploaded();
    const response = await post("/admin/intake/chats", moderator, {
      city: "bursa",
      text: "Şeyh Ali Çeşmesi\nOsmangazi'de, hicri 1150'de yapıldı.",
      uploads: [first.id, second.id],
    });
    expect(response.statusCode).toBe(201);
    const { job, draft } = IntakeJobResponseSchema.parse(response.json());
    expect(job).toMatchObject({ kind: "chat", status: "queued", city: "bursa", title: "Şeyh Ali Çeşmesi", bookMap: null });
    expect(draft).toBeNull();
    expect(job.input!.messages).toHaveLength(1);
    expect(job.input!.assetId).toBeNull();
    expect(job.input!.files.map((f) => [f.path, f.message, f.key])).toEqual([
      [`${DIR}/${job.id}/files/0.jpg`, 0, first.key],
      [`${DIR}/${job.id}/files/1.jpg`, 0, second.key],
    ]);
    // The originals moved under the job; the uploads are spent.
    expect(readFileSync(join(root, DIR, job.id, "files/0.jpg"))).toEqual(photo);
    expect(existsSync(join(root, DIR, "uploads", first.id))).toBe(false);
    expect((await post("/admin/intake/chats", moderator, { city: "bursa", uploads: [first.id] })).statusCode).toBe(400);

    const row = await prisma.intake_job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.file_path).toBeNull();
  });

  it("refuses an empty message, an unknown upload and an unknown city", async () => {
    expect((await post("/admin/intake/chats", moderator, { city: "bursa", text: "   " })).statusCode).toBe(400);
    expect((await post("/admin/intake/chats", moderator, { city: "bursa", text: "x", uploads: [randomUUID()] })).statusCode).toBe(400);
    expect((await post("/admin/intake/chats", moderator, { city: "atlantis", text: "x" })).statusCode).toBe(400);
    expect((await post("/admin/intake/chats", visitor, { city: "bursa", text: "x" })).statusCode).toBe(403);
  });

  it("adds a message once the draft is written, queues the chat again and shows its draft", async () => {
    const started = IntakeJobResponseSchema.parse((await post("/admin/intake/chats", moderator, { city: "bursa", text: "Bir çeşme." })).json()).job;

    // The worker is writing the draft: the message waits.
    await prisma.intake_job.update({ where: { id: started.id }, data: { status: "drafting" } });
    expect((await post(`/admin/intake/chats/${started.id}/messages`, moderator, { text: "İlçesi Osmangazi." })).json().error.code).toBe("DRAFTING");

    // The worker wrote it.
    await prisma.intake_job.update({ where: { id: started.id }, data: { status: "done" } });
    await prisma.intake_draft.create({
      data: { kind: "field_asset", job_id: started.id, entry_key: "chat", asset_id: `bursa-osmangazi-cesme-${tag}`, validation: { errors: [], warnings: [], missing: ["/district"] } },
    });
    const photoForIt = await uploaded();
    const response = await post(`/admin/intake/chats/${started.id}/messages`, moderator, { text: "İlçesi Osmangazi.", uploads: [photoForIt.id] });
    expect(response.statusCode).toBe(200);
    const { job, draft } = IntakeJobResponseSchema.parse(response.json());
    expect(job.status).toBe("queued");
    expect(job.input!.messages.map((m) => m.text)).toEqual(["Bir çeşme.", "İlçesi Osmangazi."]);
    expect(job.input!.files).toEqual([expect.objectContaining({ message: 1, path: `${DIR}/${started.id}/files/0.jpg` })]);
    expect(draft).toMatchObject({ kind: "field_asset", entryKey: "chat", validation: { missing: ["/district"] } });

    // GET gives the same, for the panel to poll.
    const polled = IntakeJobResponseSchema.parse((await app.inject({ method: "GET", url: `/admin/intake/jobs/${started.id}`, headers: auth(moderator) })).json());
    expect(polled.draft?.id).toBe(draft?.id);
    expect(polled.job.input?.messages).toHaveLength(2);

    // A chat has no book map: a sound map is still turned down.
    const map = [{ key: "a", titleTr: "A", titleEn: null, district: null, printedPages: null, pdfPages: [1, 2], parentKey: null, proposedId: null }];
    expect((await post(`/admin/intake/jobs/${started.id}/map`, moderator, { bookMap: map })).statusCode).toBe(404);
  });

  it("closes the chat once its draft is decided", async () => {
    const started = IntakeJobResponseSchema.parse((await post("/admin/intake/chats", moderator, { city: "bursa", text: "Bir hamam." })).json()).job;
    await prisma.intake_job.update({ where: { id: started.id }, data: { status: "done" } });
    await prisma.intake_draft.create({
      data: { kind: "field_asset", job_id: started.id, entry_key: "chat", asset_id: `bursa-osmangazi-hamam-${tag}`, status: "rejected", reviewed_at: new Date(), review_note: "yok" },
    });
    const response = await post(`/admin/intake/chats/${started.id}/messages`, moderator, { text: "Bir şey daha." });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("CHAT_CLOSED");
  });

  it("takes a message after the worker touched the chat with now()'s microseconds", async () => {
    const started = IntakeJobResponseSchema.parse((await post("/admin/intake/chats", moderator, { city: "bursa", text: "Bir köprü." })).json()).job;
    // As the worker's set_status does: a timestamp a JS Date cannot hold.
    await prisma.$executeRaw`UPDATE intake_job SET status = 'done', updated_at = now() + interval '123 microseconds' WHERE id = ${started.id}::uuid`;
    const response = await post(`/admin/intake/chats/${started.id}/messages`, moderator, { text: "Taş köprü." });
    expect(response.statusCode).toBe(200);
  });

  it("gives one upload to one message: the other is turned down and loses nothing", async () => {
    const item = await uploaded();
    const [a, b] = await Promise.all([
      post("/admin/intake/chats", moderator, { city: "bursa", text: "A", uploads: [item.id] }),
      post("/admin/intake/chats", moderator, { city: "bursa", text: "B", uploads: [item.id] }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 400]);
    const won = IntakeJobResponseSchema.parse((a.statusCode === 201 ? a : b).json()).job;
    expect(readFileSync(join(root, DIR, won.id, "files/0.jpg"))).toEqual(photo);
    expect(existsSync(join(root, DIR, won.id, "incoming"))).toBe(false);
  });

  it("leaves the photos of a turned-down message to be sent again", async () => {
    const started = IntakeJobResponseSchema.parse((await post("/admin/intake/chats", moderator, { city: "bursa", text: "Bir han." })).json()).job;
    const item = await uploaded();
    // Another message came in after this one was read: the stored input is no longer what was read.
    await prisma.intake_job.update({ where: { id: started.id }, data: { status: "drafting" } });
    expect((await post(`/admin/intake/chats/${started.id}/messages`, moderator, { text: "x", uploads: [item.id] })).json().error.code).toBe("DRAFTING");
    expect(existsSync(join(root, DIR, "uploads", item.id, "original.jpg"))).toBe(true);
    expect(existsSync(join(root, DIR, started.id))).toBe(false);

    await prisma.intake_job.update({ where: { id: started.id }, data: { status: "done" } });
    const sent = await post(`/admin/intake/chats/${started.id}/messages`, moderator, { text: "Avlusu var.", uploads: [item.id] });
    expect(sent.statusCode).toBe(200);
    expect(readFileSync(join(root, DIR, started.id, "files/0.jpg"))).toEqual(photo);
  });
});
