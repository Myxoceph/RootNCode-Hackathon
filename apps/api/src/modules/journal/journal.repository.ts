import type { JournalLayout } from "@vagabonds/contracts";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.ts";

// Never the files: a list stays small however many photos the journal holds.
const photoSelect = { id: true, width: true, height: true, lqip: true, dominant_color: true } satisfies Prisma.journal_photoSelect;
const entrySelect = {
  id: true,
  text: true,
  layout: true,
  created_at: true,
  updated_at: true,
  photos: { select: photoSelect, orderBy: [{ created_at: "asc" }, { id: "asc" }] },
} satisfies Prisma.journal_entrySelect;

export type JournalPhotoRecord = Prisma.journal_photoGetPayload<{ select: typeof photoSelect }>;
export type JournalEntryRecord = Prisma.journal_entryGetPayload<{ select: typeof entrySelect }>;

export interface JournalCursor {
  createdAt: Date;
  id: string;
}

export interface NewJournalPhoto {
  /** Chosen by the app, so its layout can name the photo; the database's own otherwise. */
  id?: string;
  width: number;
  height: number;
  lqip: string;
  dominantColor: string;
  contentType: string;
  thumb: Buffer;
  full: Buffer;
}

export interface JournalRepository {
  /** Newest first. An entry with neither text nor a photo is not listed: its photos may be on their way. */
  list(userId: string, limit: number, cursor: JournalCursor | null): Promise<{ items: JournalEntryRecord[]; total: number }>;
  create(userId: string, text: string | null, layout: JournalLayout | null): Promise<JournalEntryRecord>;
  /** Null when the user has no such entry. `layout` left out stays as it is. */
  update(userId: string, id: string, text: string | null, layout?: JournalLayout | null): Promise<JournalEntryRecord | null>;
  remove(userId: string, id: string): Promise<boolean>;
  /** How many photos the entry holds; null when the user has no such entry. */
  countEntryPhotos(userId: string, entryId: string): Promise<number | null>;
  countPhotos(userId: string, since?: Date): Promise<number>;
  /** A photo of any account by this id: whether it is this entry's, this user's, or someone else's. */
  findPhotoOwner(id: string): Promise<(JournalPhotoRecord & { user_id: string; entry_id: string }) | null>;
  addPhoto(userId: string, entryId: string, photo: NewJournalPhoto): Promise<JournalPhotoRecord>;
  removePhoto(userId: string, photoId: string): Promise<boolean>;
  findPhotoFile(photoId: string, size: "thumb" | "full"): Promise<{ contentType: string; bytes: Uint8Array } | null>;
}

const hasContent = { OR: [{ text: { not: null } }, { photos: { some: {} } }, { has_drawing: true }] } satisfies Prisma.journal_entryWhereInput;
/** An entry left empty this long ago is one whose photos never came. */
const EMPTY_KEPT_MS = 60 * 60 * 1000;

const toJson = (layout: JournalLayout | null) => (layout === null ? Prisma.DbNull : (layout as unknown as Prisma.InputJsonValue));

/** `has_drawing`: anything put on the page by hand, so a page of a drawing or of stickers alone is still a page. */
const hasDrawing = (layout: JournalLayout | null) => (layout?.strokes.length ?? 0) > 0 || (layout?.stickers.length ?? 0) > 0;

export function createJournalRepository(prisma: PrismaClient): JournalRepository {
  return {
    async list(userId, limit, cursor) {
      const after = cursor
        ? { OR: [{ created_at: { lt: cursor.createdAt } }, { created_at: cursor.createdAt, id: { lt: cursor.id } }] }
        : {};
      const [items, total] = await Promise.all([
        prisma.journal_entry.findMany({
          where: { user_id: userId, AND: [hasContent, after] },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: limit,
          select: entrySelect,
        }),
        prisma.journal_entry.count({ where: { user_id: userId, ...hasContent } }),
      ]);
      return { items, total };
    },

    async create(userId, text, layout) {
      await prisma.journal_entry.deleteMany({
        where: { user_id: userId, text: null, has_drawing: false, photos: { none: {} }, updated_at: { lt: new Date(Date.now() - EMPTY_KEPT_MS) } },
      });
      return prisma.journal_entry.create({ data: { user_id: userId, text, layout: toJson(layout), has_drawing: hasDrawing(layout) }, select: entrySelect });
    },

    async update(userId, id, text, layout) {
      const { count } = await prisma.journal_entry.updateMany({
        where: { id, user_id: userId },
        data: { text, updated_at: new Date(), ...(layout === undefined ? {} : { layout: toJson(layout), has_drawing: hasDrawing(layout) }) },
      });
      return count === 0 ? null : prisma.journal_entry.findUnique({ where: { id }, select: entrySelect });
    },

    async remove(userId, id) {
      return (await prisma.journal_entry.deleteMany({ where: { id, user_id: userId } })).count > 0;
    },

    async countEntryPhotos(userId, entryId) {
      const entry = await prisma.journal_entry.findFirst({
        where: { id: entryId, user_id: userId },
        select: { _count: { select: { photos: true } } },
      });
      return entry?._count.photos ?? null;
    },

    countPhotos: (userId, since) => prisma.journal_photo.count({ where: { user_id: userId, ...(since ? { created_at: { gte: since } } : {}) } }),

    findPhotoOwner: (id) => prisma.journal_photo.findUnique({ where: { id }, select: { ...photoSelect, user_id: true, entry_id: true } }),

    addPhoto: (userId, entryId, { dominantColor, contentType, thumb, full, ...photo }) =>
      prisma.journal_photo.create({
        data: { ...photo, thumb: new Uint8Array(thumb), full: new Uint8Array(full), user_id: userId, entry_id: entryId, dominant_color: dominantColor, content_type: contentType },
        select: photoSelect,
      }),

    async removePhoto(userId, photoId) {
      return (await prisma.journal_photo.deleteMany({ where: { id: photoId, user_id: userId } })).count > 0;
    },

    async findPhotoFile(photoId, size) {
      // Only the size asked for leaves the database.
      const photo = await prisma.journal_photo.findUnique({
        where: { id: photoId },
        select: { content_type: true, thumb: size === "thumb", full: size === "full" },
      });
      const bytes = photo?.[size];
      return photo && bytes ? { contentType: photo.content_type, bytes } : null;
    },
  };
}
