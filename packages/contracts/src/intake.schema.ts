import { z } from "zod";
import { SEAL_SUBJECTS } from "./achievement.schema";
import { AssetIdSchema, ContractVersionSchema } from "./asset.schema";
import { ADMIN_PHOTO_MAX_BYTES, ADMIN_PHOTO_TYPES, InscriptionLanguageSchema } from "./admin.schema";

/**
 * Veri Döngüsü (docs/plans/veri-dongusu.md): data that comes in to be reviewed before it is
 * published. A book PDF becomes a job (`intake_job`) that the data pipeline (data/pipeline, Python)
 * splits into drafts; a visitor's inscription photo becomes a draft of its own. Every draft waits
 * in one review queue (`intake_draft`) until a moderator approves or rejects it: nothing a model
 * writes is published on its own.
 *
 * The JSON shapes below are also what the Python worker writes into the tables' jsonb columns;
 * `npm run intake-schema -w @vagabonds/contracts` exports them as JSON Schema for it.
 */

// ── States ──────────────────────────────────────────────────────────────────────────────────

/**
 * A chat (Sohbetten Kabul) goes `queued` → `drafting` → `done`, and back to `queued` with each new
 * message. A book's way through the pipeline: `queued` (uploaded) → `mapping` (the worker reads the layout
 * and the contents) → `needs_map` (a person checks the book map) → `map_confirmed` → `drafting`
 * (one draft per asset) → `done`. `failed` keeps the error; the worker resumes from where it was.
 */
export const IntakeJobStatusSchema = z.enum(["queued", "mapping", "needs_map", "map_confirmed", "drafting", "done", "failed"]);
export type IntakeJobStatus = z.infer<typeof IntakeJobStatusSchema>;

export const IntakeDraftStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type IntakeDraftStatus = z.infer<typeof IntakeDraftStatusSchema>;

/** `book_asset`: an asset from a book PDF · `inscription`: a visitor's inscription · `field_asset`: Saha Defteri (later). */
export const IntakeDraftKindSchema = z.enum(["book_asset", "inscription", "field_asset"]);
export type IntakeDraftKind = z.infer<typeof IntakeDraftKindSchema>;

/**
 * What a photo shows, as a model is asked to say it: the seal's parts (SEAL_SUBJECTS), a view from
 * above, or something else. The dataset's own subjects are finer (`interior_domes`…); a person
 * may write those in review.
 */
export const PHOTO_SUBJECTS = [...SEAL_SUBJECTS, "aerial", "other"] as const;
export const PhotoSubjectSchema = z.enum(PHOTO_SUBJECTS);
export type PhotoSubject = z.infer<typeof PhotoSubjectSchema>;

/** A model's certainty, 0-1. */
const ConfidenceSchema = z.number().min(0).max(1);
const PageSchema = z.int().min(1);
const PageRangeSchema = z.tuple([PageSchema, PageSchema]).refine(([from, to]) => from <= to, "range must not run backwards");
const CityCodeSchema = z.string().regex(/^[a-z]+$/, "city must be an enums.json city code");
const Timestamp = z.iso.datetime({ offset: true });

// ── Book (PDF) ──────────────────────────────────────────────────────────────────────────────

/** How the book's pages are laid out, found from its first pages. */
export const IntakeLayoutSchema = z.strictObject({
  /** Each PDF page holds two printed pages side by side. */
  spread: z.boolean(),
  /** The text's columns, left to right, by language. */
  columns: z.array(z.enum(["tr", "en"])).min(1).max(2),
  /** Printed page = PDF page × (spread ? 2 : 1) + offset, for the first page of a spread. */
  pageOffset: z.int(),
});
export type IntakeLayout = z.infer<typeof IntakeLayoutSchema>;

/** One asset in the book, as the contents and the headings give it. */
export const BookMapEntrySchema = z.strictObject({
  /** Stable within the job: the draft of this entry is found by it. */
  key: z.string().regex(/^[a-z0-9-]+$/).max(120),
  titleTr: z.string().trim().min(1).max(300),
  titleEn: z.string().trim().min(1).max(300).nullable(),
  district: z.string().trim().min(1).max(80).nullable(),
  printedPages: PageRangeSchema.nullable(),
  pdfPages: PageRangeSchema,
  /** A building of a complex (külliye) points to the complex's entry. */
  parentKey: z.string().regex(/^[a-z0-9-]+$/).max(120).nullable(),
  /** The id the draft will get (`<il>-<ilçe>-<ad>`), as proposed. */
  proposedId: AssetIdSchema.nullable(),
});
export type BookMapEntry = z.infer<typeof BookMapEntrySchema>;

export const BookMapSchema = z.array(BookMapEntrySchema).max(500);

// ── Chat (Sohbetten Kabul) ─────────────────────────────────────────────────────────────────

/** `pdf`: a book (PDF Kabul) · `chat`: an admin's messages and photos about one new asset (Sohbetten Kabul). */
export const IntakeJobKindSchema = z.enum(["pdf", "chat"]);
export type IntakeJobKind = z.infer<typeof IntakeJobKindSchema>;

/** A photo sent in a chat. */
export const IntakeChatFileSchema = z.strictObject({
  /** `data/build/cache/intake/<job>/files/<name>`: the ORIGINAL file, unprocessed (with its EXIF, for the place it was taken). Not in git. */
  path: z.string().min(1).max(400),
  name: z.string().max(200),
  mime: z.string().max(80),
  /** The processed photo's 1280 px JPEG in the local media store (`intake/<upload>/1280.jpg`); the worker moves it under `assets/` when publishing. */
  key: z.string().max(400).nullable(),
  width: z.int().min(1).nullable(),
  height: z.int().min(1).nullable(),
  /** Which message it came with (index in `messages`). */
  message: z.int().min(0),
});
export type IntakeChatFile = z.infer<typeof IntakeChatFileSchema>;

export const IntakeChatMessageSchema = z.strictObject({
  text: z.string().max(50_000),
  at: z.iso.datetime({ offset: true }),
  by: z.uuid().nullable(),
});

/** What the admin said and sent: the only source the worker may draft from. */
export const IntakeChatInputSchema = z.strictObject({
  messages: z.array(IntakeChatMessageSchema).min(1).max(200),
  files: z.array(IntakeChatFileSchema).max(60),
  /** The asset this chat corrects. Always null for now: a chat brings one new asset (plan §7). */
  assetId: AssetIdSchema.nullable(),
});
export type IntakeChatInput = z.infer<typeof IntakeChatInputSchema>;

/** `GET /admin/intake/jobs/:id`, and each row of `GET /admin/intake/jobs` */
export const IntakeJobSchema = z.strictObject({
  id: z.uuid(),
  kind: IntakeJobKindSchema,
  status: IntakeJobStatusSchema,
  title: z.string(),
  city: CityCodeSchema,
  /** `data/sources.json` id of the book; the worker may propose one, a person confirms. */
  sourceId: z.string().nullable(),
  layout: IntakeLayoutSchema.nullable(),
  bookMap: BookMapSchema.nullable(),
  mapConfirmedAt: Timestamp.nullable(),
  progress: z.strictObject({ done: z.int().min(0), total: z.int().min(0) }),
  error: z.string().nullable(),
  /** A chat's messages and photos; null for a book, and in lists (a chat can be long). */
  input: IntakeChatInputSchema.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type IntakeJob = z.infer<typeof IntakeJobSchema>;

/** `POST /admin/intake/jobs`: the body is the PDF itself; these go in the query. */
export const IntakeJobCreateQuerySchema = z.object({
  title: z.string().trim().min(2).max(300),
  city: CityCodeSchema,
  sourceId: z.string().trim().min(2).max(80).optional(),
});

/** Largest PDF accepted: a city's inventory book is ~250 pages of photos. */
export const INTAKE_PDF_MAX_BYTES = 200 * 1024 * 1024;

/** `POST /admin/intake/jobs/:id/map`: the map as a person corrected it. */
export const IntakeMapConfirmRequestSchema = z.strictObject({
  bookMap: BookMapSchema.min(1),
  sourceId: z.string().trim().min(2).max(80).optional(),
});

export const IntakeJobListResponseSchema = z.strictObject({ version: ContractVersionSchema, items: z.array(IntakeJobSchema) });

// ── Drafts ──────────────────────────────────────────────────────────────────────────────────

/** A photo of a draft: extracted from the book, or the visitor's. */
export const IntakeDraftMediaSchema = z.strictObject({
  /** Media key, as `MEDIA_BASE_URL` serves it (`assets/<id>/<media>-<sha>/1280.jpg`). */
  key: z.string().min(1).max(400),
  width: z.int().min(1),
  height: z.int().min(1),
  subject: PhotoSubjectSchema.nullable(),
  subjectConfidence: ConfidenceSchema.nullable(),
  /** Screen reader text, proposed by the model; a person checks it. */
  alt: z.string().max(600).nullable(),
  /** The book's caption under the photo. */
  caption: z.string().max(600).nullable(),
  pdfPage: PageSchema.nullable(),
  /** A candidate for Taşın Dili: a straight, readable photo of an inscription. */
  arTargetCandidate: z.boolean().default(false),
});
export type IntakeDraftMedia = z.infer<typeof IntakeDraftMediaSchema>;

/**
 * Where a field's value comes from, shown beside the field in review: pages of the book, or the
 * sentence of a chat message. A chat value's quote appears word for word in that message: the worker
 * checks it and leaves out a value it cannot quote (plan §7, the quote rule).
 */
export const IntakeSourceRefSchema = z.union([
  z.strictObject({
    /** JSON pointer into the draft's record, e.g. `/dating/year`. */
    field: z.string().min(1).max(200),
    pages: z.array(PageSchema).min(1).max(40),
  }),
  z.strictObject({
    field: z.string().min(1).max(200),
    /** Index in the chat's `messages`. */
    message: z.int().min(0),
    quote: z.string().min(1).max(500),
  }),
]);

/** `validate.py`'s findings on the record: errors block approval, warnings do not. */
export const IntakeValidationSchema = z.strictObject({
  errors: z.array(z.string().max(500)).max(200),
  warnings: z.array(z.string().max(500)).max(200),
  /** Fields the source did not give (JSON pointers, e.g. `/district`): the panel asks for them. */
  missing: z.array(z.string().max(200)).max(100).default([]),
});

/** Which model wrote the draft and how. */
export const IntakeAiSchema = z.strictObject({
  model: z.string().max(120),
  /** The `version:` line of the prompt file (data/pipeline/prompts). */
  promptVersion: z.string().max(40),
  confidence: ConfidenceSchema.nullable(),
  /** The first answer failed the schema and the model was asked once to fix it. */
  repaired: z.boolean(),
  ms: z.int().min(0),
});

/**
 * A visitor's inscription as the model read it: a draft for an expert, never shown as a reading
 * until approved. Words it could not read are listed, not guessed.
 */
export const InscriptionDraftSchema = z.strictObject({
  language: InscriptionLanguageSchema.nullable(),
  script: z.string().max(80).nullable(),
  transliteration: z.string().max(12000).nullable(),
  translationTr: z.string().max(12000).nullable(),
  translationEn: z.string().max(12000).nullable(),
  /** Words or lines the model was unsure of, as they appear in `transliteration`. */
  uncertain: z.array(z.string().max(200)).max(100),
  /** Where on the monument, in the visitor's words. */
  location: z.string().max(300).nullable(),
});
export type InscriptionDraft = z.infer<typeof InscriptionDraftSchema>;

/**
 * One item of the review queue. `record` is the draft itself: for `book_asset` and `field_asset`
 * a dataset record (data/schema/eser.schema.json, checked by `validate.py`, so typed loosely
 * here); for `inscription` an InscriptionDraft.
 */
export const IntakeDraftSchema = z.strictObject({
  id: z.uuid(),
  kind: IntakeDraftKindSchema,
  status: IntakeDraftStatusSchema,
  jobId: z.uuid().nullable(),
  /** The asset it adds (book, field) or adds to (inscription). */
  assetId: AssetIdSchema,
  /** The book map entry it was drafted from. */
  entryKey: z.string().nullable(),
  record: z.record(z.string(), z.unknown()),
  media: z.array(IntakeDraftMediaSchema),
  sourceRefs: z.array(IntakeSourceRefSchema),
  validation: IntakeValidationSchema,
  ai: IntakeAiSchema.nullable(),
  /** An asset already in the dataset that looks like the same one (close by, similar name). */
  duplicateOf: AssetIdSchema.nullable(),
  note: z.string().max(1000).nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  reviewedAt: Timestamp.nullable(),
  reviewNote: z.string().max(1000).nullable(),
  /**
   * Approval and publishing are two steps: the API records the approval, the data pipeline then
   * writes the record into the dataset and the database the team's way (data/eserler file,
   * media_pipeline.py, import_to_db.py) and sets this. Until then an approved draft is not on the map.
   */
  appliedAt: Timestamp.nullable(),
  /** Why publishing an approved draft failed (validate.py, a photo…); it stays in the queue until fixed. */
  applyError: z.string().max(4000).nullable(),
});
export type IntakeDraft = z.infer<typeof IntakeDraftSchema>;

/** `GET /admin/intake/drafts` */
export const IntakeDraftListQuerySchema = z.object({
  status: IntakeDraftStatusSchema.default("pending"),
  kind: IntakeDraftKindSchema.optional(),
  jobId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const IntakeDraftListResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  total: z.int().min(0),
  items: z.array(IntakeDraftSchema),
});

/**
 * `POST /admin/intake/drafts/:id/review`: approve (with the record as corrected) or reject. A draft
 * whose record has validation errors is approved only with a corrected record; publishing checks it again.
 */
export const IntakeReviewRequestSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.literal("approve"),
    /** The record as the reviewer corrected it; without it the draft's own. */
    record: z.record(z.string(), z.unknown()).optional(),
    note: z.string().trim().max(1000).optional(),
  }),
  z.strictObject({
    decision: z.literal("reject"),
    note: z.string().trim().min(3).max(1000),
  }),
]);

export const IntakeDraftResponseSchema = z.strictObject({ version: ContractVersionSchema, draft: IntakeDraftSchema });

/** `GET /admin/intake/jobs/:id` and the chat routes: the job, and for a chat its draft once the worker wrote it. */
export const IntakeJobResponseSchema = z.strictObject({
  version: ContractVersionSchema,
  job: IntakeJobSchema,
  draft: IntakeDraftSchema.nullable().default(null),
});

// ── Chat requests ──────────────────────────────────────────────────────────────────────────

export const INTAKE_UPLOAD_TYPES = ADMIN_PHOTO_TYPES;
export const INTAKE_UPLOAD_MAX_BYTES = ADMIN_PHOTO_MAX_BYTES;

/** `POST /admin/intake/uploads`: the body is the photo itself; its file name goes in the query. */
export const IntakeUploadQuerySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});

/** A photo uploaded for a chat message, before the message is sent. */
export const IntakeUploadSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().max(200),
  mime: z.string().max(80),
  /** Its 1280 px JPEG in the local media store, to show while the message is written. */
  key: z.string().max(400),
  width: z.int().min(1),
  height: z.int().min(1),
});
export type IntakeUpload = z.infer<typeof IntakeUploadSchema>;

export const IntakeUploadResponseSchema = z.strictObject({ version: ContractVersionSchema, upload: IntakeUploadSchema });

/**
 * `POST /admin/intake/chats` (starts a chat) and `POST /admin/intake/chats/:id/messages` (adds to one):
 * a message, with the photos uploaded for it. Either may be empty, not both.
 */
/** Most characters one message's text holds, and most photos sent with one message. */
export const INTAKE_MESSAGE_MAX_CHARS = 50_000;
export const INTAKE_MESSAGE_MAX_UPLOADS = 20;

const ChatMessageFields = {
  text: z.string().trim().max(INTAKE_MESSAGE_MAX_CHARS).default(""),
  uploads: z.array(z.uuid()).max(INTAKE_MESSAGE_MAX_UPLOADS).default([]),
};
/** The rules every message keeps, whether it starts a chat or adds to one. */
const withMessageRules = <T extends z.ZodType<{ text: string; uploads: string[] }>>(schema: T) =>
  schema
    .refine((m) => m.text.length > 0 || m.uploads.length > 0, "a message needs text or a photo")
    .refine((m) => new Set(m.uploads).size === m.uploads.length, "an upload is sent once");

export const IntakeChatMessageRequestSchema = withMessageRules(z.strictObject(ChatMessageFields));

/** `POST /admin/intake/chats`: the first message, and the city the asset is in (the worker reads districts and places within it). */
export const IntakeChatCreateRequestSchema = withMessageRules(z.strictObject({ ...ChatMessageFields, city: CityCodeSchema }));

/** Most messages and photos one chat holds (IntakeChatInputSchema). */
export const INTAKE_CHAT_MAX_MESSAGES = 200;
export const INTAKE_CHAT_MAX_FILES = 60;
