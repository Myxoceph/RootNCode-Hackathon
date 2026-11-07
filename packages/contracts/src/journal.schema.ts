import { z } from "zod";
import { ContractVersionSchema } from "./asset.schema";

/** Longest text of one entry, in characters. */
export const JOURNAL_TEXT_MAX = 4000;
/** Photos one entry can hold. */
export const JOURNAL_PHOTOS_PER_ENTRY = 4;
/** Photos one account can keep: they are stored on the API's own database (ADR 0004). */
export const JOURNAL_PHOTOS_KEPT = 300;
export const JOURNAL_PHOTOS_PER_DAY = 40;
/** The file sent. The app shrinks a photo to `JOURNAL_PHOTO_SEND_SIDE` first, so it is well under this. */
export const JOURNAL_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const JOURNAL_PHOTO_SEND_SIDE = 2048;
export const JOURNAL_PHOTO_MIN_SIDE = 64;
export const JOURNAL_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const JOURNAL_PAGE_MAX = 30;

export const JournalIdSchema = z.uuid();

/**
 * A photo in the visitor's journal. Its paths are signed and expire, as image tags cannot send a
 * token: fetch the list again for fresh ones. `thumbUrl` is what a page shows; `fullUrl` only when opened.
 */
export const JournalPhotoSchema = z.strictObject({
  id: JournalIdSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** A tiny picture to show until the photo arrives. */
  lqip: z.string(),
  dominantColor: z.string(),
  thumbUrl: z.string(),
  fullUrl: z.string(),
});

/**
 * Where a photo lies on its page, as the visitor put it. All in shares of the page's width, so a page
 * looks the same on any screen; `x` and `y` are the top left before turning, from below the date.
 */
export const JournalPhotoPlacementSchema = z.strictObject({
  id: JournalIdSchema,
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(30),
  width: z.number().min(0.05).max(1.5),
  /** Degrees, about its centre. */
  rotation: z.number().min(-180).max(180),
  /** Higher lies over lower. */
  z: z.number().int().min(0).max(10_000),
});

export const JournalTextPlacementSchema = z.strictObject({
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(30),
  width: z.number().min(0.05).max(1.5),
  z: z.number().int().min(0).max(10_000),
});

/** The pens of a drawing on a page. */
export const JOURNAL_STROKE_COLORS = ["ink", "green", "red", "blue"] as const;
export const JOURNAL_STROKE_SIZES = ["thin", "thick"] as const;
/** All a page's drawing together, in characters of `d`: a page's list entry stays light (ADR 0004). */
export const JOURNAL_STROKES_MAX_CHARS = 48_000;
export const JOURNAL_STROKES_MAX = 300;

/**
 * One line drawn by hand. `d` is its points in thousandths of the page's width: the first in full,
 * then each as the step from the one before ("120,80 3,-2 4,0"), so it stays short.
 */
export const JournalStrokeSchema = z.strictObject({
  color: z.enum(JOURNAL_STROKE_COLORS),
  size: z.enum(JOURNAL_STROKE_SIZES),
  d: z.string().max(JOURNAL_STROKES_MAX_CHARS).regex(/^-?\d+,-?\d+( -?\d+,-?\d+)*$/),
});

/** Stickers one page can hold: each is drawn over and over, for as long as the page is open. */
export const JOURNAL_STICKERS_PER_ENTRY = 20;

/**
 * A sticker on a page. `sticker` names one of the app's own drawings: only its name is saved, nothing is
 * uploaded. Free text and not a list here, so a sticker added later does not make older data invalid; one
 * the app does not know is simply not drawn.
 */
export const JournalStickerPlacementSchema = z.strictObject({
  id: JournalIdSchema,
  sticker: z.string().regex(/^[a-z-]{1,40}$/),
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(30),
  width: z.number().min(0.05).max(1.5),
  rotation: z.number().min(-180).max(180),
  z: z.number().int().min(0).max(10_000),
});

export const JournalLayoutSchema = z.strictObject({
  // A photo may be placed before it has arrived; one given up on is simply not drawn.
  photos: z.array(JournalPhotoPlacementSchema).max(JOURNAL_PHOTOS_PER_ENTRY * 2),
  text: JournalTextPlacementSchema,
  // Left out on pages arranged before drawing could be done.
  strokes: z
    .array(JournalStrokeSchema)
    .max(JOURNAL_STROKES_MAX)
    .refine((strokes) => strokes.reduce((sum, stroke) => sum + stroke.d.length, 0) <= JOURNAL_STROKES_MAX_CHARS, "Too much drawing on one page")
    .default([]),
  // Left out on pages arranged before there were stickers.
  stickers: z.array(JournalStickerPlacementSchema).max(JOURNAL_STICKERS_PER_ENTRY).default([]),
});

/** One page of the journal: text, photos or both. */
export const JournalEntrySchema = z.strictObject({
  id: JournalIdSchema,
  text: z.string().nullable(),
  photos: z.array(JournalPhotoSchema),
  /** Null: not arranged by hand, laid out in the usual way. */
  layout: JournalLayoutSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** `GET /me/journal`: a page of the visitor's own entries, newest first. */
export const JournalPageResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  items: z.array(JournalEntrySchema),
  /** Entries with text or a photo, in all. */
  total: z.number().int().nonnegative(),
  /** Asks for the next page; null on the last. */
  nextCursor: z.string().nullable(),
});

export const JournalPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(JOURNAL_PAGE_MAX).default(8),
  cursor: z.string().max(80).optional(),
});

/** `POST` and `PATCH /me/journal`. Null: an entry of photos alone; they follow one by one. */
export const JournalWriteRequestSchema = z.strictObject({
  text: z.string().trim().max(JOURNAL_TEXT_MAX).nullable(),
  /** Left out, it stays as it is; null goes back to the usual layout. */
  layout: JournalLayoutSchema.nullable().optional(),
});

/** `POST /me/journal/:id/photos`: an id the app chose, so a layout can name the photo before it arrives. */
export const JournalPhotoUploadQuerySchema = z.object({ id: JournalIdSchema.optional() });

export type JournalPhotoPlacement = z.infer<typeof JournalPhotoPlacementSchema>;
export type JournalStickerPlacement = z.infer<typeof JournalStickerPlacementSchema>;
export type JournalTextPlacement = z.infer<typeof JournalTextPlacementSchema>;
export type JournalStroke = z.infer<typeof JournalStrokeSchema>;
export type JournalStrokeColor = JournalStroke["color"];
export type JournalStrokeSize = JournalStroke["size"];
export type JournalLayout = z.infer<typeof JournalLayoutSchema>;
export type JournalPhoto = z.infer<typeof JournalPhotoSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export type JournalPageResponse = z.infer<typeof JournalPageResponseSchema>;
export type JournalWriteRequest = z.infer<typeof JournalWriteRequestSchema>;
