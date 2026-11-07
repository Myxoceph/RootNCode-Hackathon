import {
  BookMapSchema,
  IntakeChatInputSchema,
  type IntakeChatInput,
  IntakeAiSchema,
  IntakeDraftMediaSchema,
  IntakeLayoutSchema,
  IntakeSourceRefSchema,
  IntakeValidationSchema,
  type BookMapEntry,
  type IntakeDraft,
  type IntakeDraftKind,
  type IntakeDraftStatus,
  type IntakeJob,
} from "@vagabonds/contracts";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";

/**
 * Veri Döngüsü's tables (docs/plans/veri-dongusu.md §5.2). The Python worker writes the jsonb
 * columns too: what it wrote is read leniently, so one bad row shows as empty in the panel instead
 * of breaking the whole list.
 */

type JobRow = Prisma.intake_jobGetPayload<object>;
type DraftRow = Prisma.intake_draftGetPayload<object>;

/** A jsonb value as `schema` reads it, or `fallback` when the worker wrote something else. */
function lenient<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);
/** Text the worker may have written longer than the contract allows: cut, so one row cannot break a list. */
const clip = (text: string | null, max: number) => (text !== null && text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A job as the API gives it; `withInput` adds a chat's messages (left out of lists: a chat can be long). */
export function toIntakeJob(row: JobRow, withInput = false): IntakeJob {
  return {
    id: row.id,
    kind: row.kind as IntakeJob["kind"],
    status: row.status as IntakeJob["status"],
    title: row.title,
    city: row.city,
    sourceId: row.source_id,
    layout: lenient(IntakeLayoutSchema.nullable(), row.layout, null),
    bookMap: lenient(BookMapSchema.nullable(), row.book_map, null),
    mapConfirmedAt: iso(row.map_confirmed_at),
    progress: { done: row.progress_done, total: row.progress_total },
    error: row.error,
    input: withInput ? lenient(IntakeChatInputSchema.nullable(), row.input, null) : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toIntakeDraft(row: DraftRow): IntakeDraft {
  return {
    id: row.id,
    kind: row.kind as IntakeDraft["kind"],
    status: row.status as IntakeDraft["status"],
    jobId: row.job_id,
    assetId: row.asset_id,
    entryKey: row.entry_key,
    record: lenient(z.record(z.string(), z.unknown()), row.record, {}),
    media: lenient(z.array(IntakeDraftMediaSchema), row.media, []),
    sourceRefs: lenient(z.array(IntakeSourceRefSchema), row.source_refs, []),
    validation: lenient(IntakeValidationSchema, row.validation, { errors: ["validation: unreadable"], warnings: [], missing: [] }),
    ai: lenient(IntakeAiSchema.nullable(), row.ai, null),
    duplicateOf: row.duplicate_of,
    note: clip(row.note, 1000),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reviewedAt: iso(row.reviewed_at),
    reviewNote: clip(row.review_note, 1000),
    appliedAt: iso(row.applied_at),
    applyError: clip(row.apply_error, 4000),
  };
}

export interface DraftFilter {
  status: IntakeDraftStatus;
  kind?: IntakeDraftKind | undefined;
  jobId?: string | undefined;
  limit: number;
  offset: number;
}

export function createIntakeRepository(prisma: PrismaClient) {
  return {
    createJob(data: { id: string; title: string; city: string; sourceId: string | null; filePath: string; createdBy: string }) {
      return prisma.intake_job.create({
        data: { id: data.id, title: data.title, city: data.city, source_id: data.sourceId, file_path: data.filePath, created_by: data.createdBy },
      });
    },

    listJobs() {
      return prisma.intake_job.findMany({ orderBy: { created_at: "desc" }, take: 100 });
    },

    findJob(id: string) {
      return prisma.intake_job.findUnique({ where: { id } });
    },

    createChatJob(data: { id: string; title: string; city: string; input: IntakeChatInput; createdBy: string }) {
      return prisma.intake_job.create({
        data: { id: data.id, kind: "chat", title: data.title, city: data.city, input: data.input as Prisma.InputJsonValue, created_by: data.createdBy },
      });
    },

    /**
     * A chat's input with a new message, queued again for the worker. Only if the job is as it was
     * read (`updatedAt`) and not being drafted: false when the worker took it up meanwhile, so a
     * message is never lost under a draft written from the older input.
     */
    async appendChat(id: string, input: IntakeChatInput, readAt: Date): Promise<boolean> {
      const { count } = await prisma.intake_job.updateMany({
        where: { id, kind: "chat", updated_at: readAt, status: { in: ["queued", "done", "failed"] } },
        data: { input: input as Prisma.InputJsonValue, status: "queued", error: null, updated_at: new Date() },
      });
      return count === 1;
    },

    /** The one draft of a chat (entry_key 'chat'), or of nothing. */
    findDraftOfJob(jobId: string) {
      return prisma.intake_draft.findFirst({ where: { job_id: jobId }, orderBy: { created_at: "desc" } });
    },

    /** Only from `needs_map`: false when the job was elsewhere (another person confirmed it first). */
    async confirmMap(id: string, bookMap: BookMapEntry[], sourceId: string | undefined, userId: string): Promise<boolean> {
      const { count } = await prisma.intake_job.updateMany({
        where: { id, status: "needs_map" },
        data: {
          status: "map_confirmed",
          book_map: bookMap as unknown as Prisma.InputJsonValue,
          ...(sourceId !== undefined && { source_id: sourceId }),
          map_confirmed_at: new Date(),
          map_confirmed_by: userId,
          progress_done: 0,
          progress_total: bookMap.length,
          error: null,
          updated_at: new Date(),
        },
      });
      return count === 1;
    },

    async listDrafts(filter: DraftFilter) {
      const where: Prisma.intake_draftWhereInput = {
        status: filter.status,
        ...(filter.kind && { kind: filter.kind }),
        ...(filter.jobId && { job_id: filter.jobId }),
      };
      const [total, rows] = await prisma.$transaction([
        prisma.intake_draft.count({ where }),
        // Oldest first: the queue is worked through in the order things came in.
        prisma.intake_draft.findMany({ where, orderBy: [{ created_at: "asc" }, { id: "asc" }], take: filter.limit, skip: filter.offset }),
      ]);
      return { total, rows };
    },

    findDraft(id: string) {
      return prisma.intake_draft.findUnique({ where: { id } });
    },

    cityExists(code: string) {
      return prisma.city.findUnique({ where: { code }, select: { code: true } }).then((row) => row !== null);
    },

    assetExists(id: string) {
      return prisma.asset.findUnique({ where: { id }, select: { id: true } }).then((row) => row !== null);
    },

    /**
     * Decides a pending draft. `decided`: someone else decided it first (only `pending` moves), so two
     * reviewers never both approve. `taken`: another draft is already approved as this new asset
     * (intake_draft_new_asset_idx), even when both approvals arrive at once.
     */
    async review(
      id: string,
      decision: { status: "approved"; assetId: string; record: Record<string, unknown> } | { status: "rejected" },
      note: string | null,
      userId: string,
    ): Promise<"ok" | "decided" | "taken"> {
      const now = new Date();
      const update = prisma.intake_draft.updateMany({
        where: { id, status: "pending" },
        data: {
          status: decision.status,
          ...(decision.status === "approved" && {
            asset_id: decision.assetId,
            record: decision.record as Prisma.InputJsonValue,
          }),
          review_note: note,
          reviewed_by: userId,
          reviewed_at: now,
          updated_at: now,
        },
      });
      try {
        return (await update).count === 1 ? "ok" : "decided";
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return "taken";
        throw error;
      }
    },
  };
}

export type IntakeRepository = ReturnType<typeof createIntakeRepository>;
