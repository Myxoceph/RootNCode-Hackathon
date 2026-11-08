/**
 * Integration tests: real PostgreSQL (DATABASE_URL). The intake tables' constraints, which the Python
 * worker relies on as much as the API (docs/veri-dongusu.md §5.2).
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/db/prisma.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(!DATABASE_URL)("intake tables (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let jobId: string;

  beforeAll(async () => {
    prisma = createPrismaClient(DATABASE_URL as string);
    const job = await prisma.intake_job.create({ data: { title: "Test kitabı", city: "bursa", file_path: "data/build/cache/intake/test/source.pdf" } });
    jobId = job.id;
  });

  afterAll(async () => {
    // Drafts go with their job (ON DELETE CASCADE).
    await prisma.intake_job.delete({ where: { id: jobId } });
    await prisma.$disconnect();
  });

  it("keeps one draft per book entry: writing it again updates it", async () => {
    const write = (title: string) =>
      prisma.$executeRaw`
        INSERT INTO intake_draft (kind, job_id, asset_id, entry_key, record)
        VALUES ('book_asset', ${jobId}::uuid, 'bursa-test-eser', 'e1', ${JSON.stringify({ title })}::jsonb)
        ON CONFLICT (job_id, entry_key) WHERE job_id IS NOT NULL
        DO UPDATE SET record = EXCLUDED.record, updated_at = now()`;
    await write("ilk");
    await write("ikinci");
    const drafts = await prisma.intake_draft.findMany({ where: { job_id: jobId } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.record).toEqual({ title: "ikinci" });
  });

  it("refuses a book draft without its entry, and an inscription tied to a book", async () => {
    await expect(prisma.intake_draft.create({ data: { kind: "book_asset", job_id: jobId, asset_id: "bursa-test-eser" } })).rejects.toThrow();
    await expect(
      prisma.intake_draft.create({ data: { kind: "inscription", job_id: jobId, asset_id: "bursa-test-eser", entry_key: null } }),
    ).rejects.toThrow();
  });

  it("refuses a decided draft without its date, and a pending one with one", async () => {
    await expect(prisma.intake_draft.create({ data: { kind: "inscription", asset_id: "bursa-test-eser", status: "approved" } })).rejects.toThrow();
    await expect(
      prisma.intake_draft.create({ data: { kind: "inscription", asset_id: "bursa-test-eser", reviewed_at: new Date() } }),
    ).rejects.toThrow();
  });

  it("refuses unknown states and ids that are not kebab-case", async () => {
    await expect(prisma.intake_job.update({ where: { id: jobId }, data: { status: "half-done" } })).rejects.toThrow();
    await expect(prisma.intake_draft.create({ data: { kind: "inscription", asset_id: "Bursa Ulucami" } })).rejects.toThrow();
  });
});
